/**
 * Data validation and cleaning utilities for chart data processing
 */

/**
 * Maps CAST expression columns back to their expected aliases
 * When backend applies casting, column names become CAST/REPLACE expressions
 * This function maps them back to the expected measure aliases like "SUM(fieldname)"
 */
export const remapCastExpressionColumns = (result: any, fields?: any[]): any => {
  if (!result.rows || result.rows.length === 0 || !fields) {
    return result;
  }

  console.log('🔍 Remapping debug:', {
    resultColumns: result.columns?.map((c: any) => c.name || c),
    fieldsWithCasting: fields.filter((f: any) => f.castType)
  });

  // Build a map of result-column names -> expected aliases.
  // Historically this was only used for CAST(...) expression columns, but we also need it for
  // qualified aggregation aliases coming from backend/local execution (e.g. COUNT(tbl.col) vs COUNT(col)).
  const castExpressionMap: Record<string, string> = {};
  
  fields.forEach(field => {
    // 1) CAST expression remapping (existing behavior)
    if (field.castType) {
      // Field has casting applied - could be measure or dimension
      let expectedAlias: string;
      
      if (field.type === 'measure' && field.aggregation) {
        // Measure: SUM(fieldname)
        expectedAlias = `${field.aggregation.toUpperCase()}(${field.columnName})`;
      } else {
        // Dimension or raw column: just the column name
        expectedAlias = field.columnName;
      }
      
      // Try to find the CAST expression in the result columns
      // Look for pattern: CAST(REPLACE("FieldName", ...) AS TYPE)
      const castExpression = result.columns
        ?.find((col: any) => {
          const colName = col.name || col;
          return colName.includes('CAST') && colName.includes(field.columnName);
        })
        ?.name;
      
      if (castExpression) {
        console.log(`  ✓ Mapping: "${castExpression}" → "${expectedAlias}"`);
        castExpressionMap[castExpression] = expectedAlias;
      }
    }

    // 2) Qualified aggregation alias remapping (new behavior)
    // Some execution paths can return aggregation aliases with a table-qualified column name,
    // e.g. COUNT(coreLoadControlData.slotUtilizationAvg) while the UI fields expect COUNT(slotUtilizationAvg).
    // If the expected alias is missing, but we can find a qualified variant, remap it.
    if (field.type === 'measure' && field.aggregation && typeof field.columnName === 'string') {
      const agg = field.aggregation.toUpperCase();
      const expectedAlias = `${agg}(${field.columnName})`;
      const hasExpected = result.rows?.[0] && Object.prototype.hasOwnProperty.call(result.rows[0], expectedAlias);
      if (hasExpected) {
        return;
      }

      // Only attempt remap when the field columnName is unqualified.
      // If it's already qualified, expectedAlias is already the qualified one.
      if (!field.columnName.includes('.')) {
        const qualifiedCandidate = result.columns?.find((col: any) => {
          const colName = col.name || col;
          return (
            typeof colName === 'string' &&
            colName.startsWith(`${agg}(`) &&
            colName.endsWith(`.${field.columnName})`)
          );
        });
        const qualifiedName = qualifiedCandidate?.name || qualifiedCandidate;
        if (qualifiedName && typeof qualifiedName === 'string') {
          console.log(`  ✓ Mapping: "${qualifiedName}" → "${expectedAlias}" (qualified aggregation alias)`);
          castExpressionMap[qualifiedName] = expectedAlias;
        }
      }
    }
  });

  // If no mappings found, return as-is
  if (Object.keys(castExpressionMap).length === 0) {
    console.log('  No CAST mappings found, returning result as-is');
    return result;
  }

  // Remap the rows
  const remappedRows = result.rows.map((row: any) => {
    const newRow: any = {};
    
    Object.entries(row).forEach(([key, value]) => {
      const mappedKey = castExpressionMap[key] || key;
      newRow[mappedKey] = value;
    });
    
    return newRow;
  });

  // Remap the columns
  const remappedColumns = result.columns?.map((col: any) => {
    const mappedName = castExpressionMap[col.name] || col.name;
    return { ...col, name: mappedName };
  });

  return {
    ...result,
    rows: remappedRows,
    columns: remappedColumns
  };
};

/**
 * Validates and cleans data for chart consumption
 * Removes invalid numeric values and filters out empty rows
 */
export const validateAndCleanData = (result: any) => {
  if (!result.rows || result.rows.length === 0) {
    return result;
  }

  console.log(`🧹 Validating and cleaning ${result.rows.length} rows`);
  
  const cleanedRows = result.rows
    .map((row: any) => {
      const cleanedRow = { ...row };
      
      // Clean each field in the row
      Object.keys(cleanedRow).forEach(key => {
        const value = cleanedRow[key];

        // DuckDB (and Arrow) can yield BigInt for COUNT(*) and some integer aggregates.
        // Observable Plot expects JS numbers for numeric channels.
        if (typeof value === 'bigint') {
          // Avoid BigInt literals (0n) to keep compatibility with TS targets < ES2020.
          const zero = BigInt(0);
          const abs = value < zero ? -value : value;
          if (abs <= BigInt(Number.MAX_SAFE_INTEGER)) {
            cleanedRow[key] = Number(value);
          } else {
            // Too large to represent safely; keep as string to avoid misleading numbers.
            cleanedRow[key] = value.toString();
          }
          return;
        }
        
        // Handle invalid numeric values
        if (typeof value === 'number') {
          if (!isFinite(value) || isNaN(value)) {
            console.warn(`🚨 Invalid value found in field ${key}: ${value}, replacing with null`);
            cleanedRow[key] = null;
          }
        }
        
        // Handle string representations of numeric values
        if (typeof value === 'string') {
          const trimmed = value.trim();

          // Some sources (or transformations) can produce numeric strings wrapped in quotes,
          // e.g. "\"150235288461\"" (a string containing "150235288461").
          // In some cases the quotes are escaped and the string looks like \\"150\\".
          let unwrapped = trimmed;

          // Try to decode JSON-string-literals (handles nested escaping robustly).
          // Example: unwrapped = "\"150\"" -> JSON.parse(unwrapped) === "150"
          // Example: unwrapped = "\\\"150\\\"" (string contains \"150\") is not valid JSON,
          // but if it is enclosed in quotes it becomes parseable; we handle the common valid cases here.
          for (let i = 0; i < 2; i++) {
            const t = unwrapped.trim();
            if (t.startsWith('"') && t.endsWith('"')) {
              try {
                const parsed = JSON.parse(t);
                if (typeof parsed === 'string') {
                  unwrapped = parsed;
                  continue;
                }
              } catch {
                // fall through
              }
            }
            break;
          }

          // Fallback: unwrap a couple common non-JSON encodings
          const unwrapOnce = (s: string) => {
            const t = s.trim();
            if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
              return t.slice(1, -1).trim();
            }
            if ((t.startsWith('\\"') && t.endsWith('\\"')) || (t.startsWith("\\'") && t.endsWith("\\'"))) {
              return t.slice(2, -2).trim();
            }
            return t;
          };
          unwrapped = unwrapOnce(unwrapOnce(unwrapped));

          // Only convert strings that are ENTIRELY numeric (avoid datetimes like "2023-06-08 09:35:00")
          // Accept integers, floats, and scientific notation.
          const numericPattern = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
          if (numericPattern.test(unwrapped)) {
            const numValue = Number(unwrapped);
            if (!isFinite(numValue) || isNaN(numValue)) {
              console.warn(`🚨 Invalid numeric string found in field ${key}: ${value}, replacing with null`);
              cleanedRow[key] = null;
            } else {
              // Convert valid numeric strings to numbers (best-effort; may lose precision for huge integers)
              cleanedRow[key] = numValue;
            }
          }
        }
      });
      
      return cleanedRow;
    })
    .filter((row: any) => {
      // Filter out rows that are completely null/undefined
      const hasValidData = Object.values(row).some(value => 
        value !== null && value !== undefined && value !== ''
      );
      return hasValidData;
    });

  const filteredCount = result.rows.length - cleanedRows.length;
  if (filteredCount > 0) {
    console.warn(`🧹 Filtered out ${filteredCount} invalid rows`);
  }

  return {
    ...result,
    rows: cleanedRows,
    row_count: cleanedRows.length
  };
};

/**
 * Checks if a dataset is considered large and should trigger performance warnings
 */
export const isLargeDataset = (rowCount: number): boolean => {
  return rowCount > 50000;
};

/**
 * Logs performance warnings for large datasets
 */
export const logPerformanceWarning = (rowCount: number): void => {
  if (isLargeDataset(rowCount)) {
    console.warn(`⚠️ Large dataset detected (${rowCount} rows). Consider using aggregation or filtering.`);
  }
}; 