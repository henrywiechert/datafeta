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

  // Build a map of CAST expressions to their expected aliases
  const castExpressionMap: Record<string, string> = {};
  
  fields.forEach(field => {
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
        
        // Handle invalid numeric values
        if (typeof value === 'number') {
          if (!isFinite(value) || isNaN(value)) {
            console.warn(`🚨 Invalid value found in field ${key}: ${value}, replacing with null`);
            cleanedRow[key] = null;
          }
        }
        
        // Handle string representations of invalid numbers
        if (typeof value === 'string') {
          // Only convert strings that are ENTIRELY numeric (not datetime strings like "2023-06-08 09:35:00")
          // Use trim to handle whitespace, and check if the whole string converts cleanly
          const trimmed = value.trim();
          const numValue = parseFloat(trimmed);
          
          // Only convert if the string is entirely a number (parseFloat consumes the whole string)
          // Check by converting back to string and comparing
          if (!isNaN(numValue) && numValue.toString() === trimmed) {
            if (!isFinite(numValue)) {
              console.warn(`🚨 Invalid numeric string found in field ${key}: ${value}, replacing with null`);
              cleanedRow[key] = null;
            } else {
              // Convert valid numeric strings to numbers
              cleanedRow[key] = numValue;
            }
          }
          // Non-numeric strings (including datetime strings) are left as-is
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