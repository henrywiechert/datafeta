import { Field, QueryDescription, QueryResult, FilterConfig, VirtualTableDefinition, VirtualColumnDefinition } from '../types';
import { buildAggregatedQuery, buildRawQuery } from './queryBuilder';
import { 
  isMeasureNamesField, 
  isMeasureValuesField, 
  getMeasureFieldsForUnpivot,
  isSyntheticField,
  MEASURE_NAMES_FIELD,
  MEASURE_VALUES_FIELD 
} from '../utils/syntheticFields';
import { getResultColumnName } from '../utils/fieldUtils';
import { apiService } from '../apiService';

/**
 * Detect if synthetic fields (MeasureNames or MeasureValues) are being used
 */
export function detectSyntheticFieldUsage(fields: Field[]): {
  hasMeasureNames: boolean;
  hasMeasureValues: boolean;
  measureNamesField?: Field;
  measureValuesField?: Field;
} {
  const measureNamesField = fields.find(f => isMeasureNamesField(f));
  const measureValuesField = fields.find(f => isMeasureValuesField(f));

  return {
    hasMeasureNames: !!measureNamesField,
    hasMeasureValues: !!measureValuesField,
    measureNamesField,
    measureValuesField,
  };
}

/**
 * Build and execute query for synthetic MeasureNames/MeasureValues fields
 * 
 * Strategy:
 * 1. Get list of measures to include (filtered by MeasureNames if applicable)
 * 2. Build a single query with all measures as separate columns
 * 3. Return result - the visualization layer will handle MeasureNames/MeasureValues mapping
 */
export async function buildUnpivotedQuery({
  xFields,
  yFields,
  availableFields,
  selectedTable,
  selectedDatabase,
  filterConfigurations,
  appliedFilterConfigurations,
  labelFields = [],
  tooltipFields = [],
  colorField = null,
  sizeField = null,
  virtualTable = null,
  virtualColumns = [],
  signal,
}: {
  xFields: Field[];
  yFields: Field[];
  availableFields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
  filterConfigurations: Record<string, FilterConfig>;
  appliedFilterConfigurations: Record<string, FilterConfig>;
  labelFields?: Field[];
  tooltipFields?: Field[];
  colorField?: Field | null;
  sizeField?: Field | null;
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: VirtualColumnDefinition[];
  signal?: AbortSignal;
}): Promise<QueryResult> {
  // Detect synthetic field usage - include all fields that should be in the query
  const allFields = [...xFields, ...yFields];
  
  // Add colorField and sizeField if present (and not synthetic)
  if (colorField && !isSyntheticField(colorField)) {
    allFields.push(colorField);
  }
  if (sizeField && !isSyntheticField(sizeField)) {
    allFields.push(sizeField);
  }
  const { hasMeasureNames, hasMeasureValues, measureValuesField } = detectSyntheticFieldUsage(allFields);

  if (!hasMeasureValues && !hasMeasureNames) {
    throw new Error('Neither MeasureValues nor MeasureNames field found in query fields');
  }

  // Get MeasureNames filter if it exists and collect field IDs to remove from filters
  let measureNamesFilter: string[] | undefined;
  let measureNamesFieldId: string | undefined;
  let measureValuesFieldId: string | undefined;
  
  // Find MeasureNames filter and field ID
  const measureNamesFilterEntry = Object.entries(appliedFilterConfigurations).find(
    ([fieldId, config]) => config.columnName === MEASURE_NAMES_FIELD
  );
  if (measureNamesFilterEntry) {
    const [fieldId, config] = measureNamesFilterEntry;
    measureNamesFieldId = fieldId;
    if (config.type === 'discrete') {
      measureNamesFilter = config.selectedValues;
    }
  }
  
  // Find MeasureValues field ID (in case it's filtered, though it shouldn't be)
  const measureValuesFilterEntry = Object.entries(appliedFilterConfigurations).find(
    ([fieldId, config]) => config.columnName === MEASURE_VALUES_FIELD
  );
  if (measureValuesFilterEntry) {
    measureValuesFieldId = measureValuesFilterEntry[0];
  }

  // Get actual measure fields to include
  const measureFields = getMeasureFieldsForUnpivot(availableFields, measureNamesFilter);

  if (measureFields.length === 0) {
    // No measures - return empty result
    return {
      columns: [],
      rows: [],
      row_count: 0,
    };
  }

  // Remove MeasureNames and MeasureValues from filter configurations by field ID
  const filteredFilterConfigurations = { ...appliedFilterConfigurations };
  if (measureNamesFieldId) {
    delete filteredFilterConfigurations[measureNamesFieldId];
  }
  if (measureValuesFieldId) {
    delete filteredFilterConfigurations[measureValuesFieldId];
  }

  // Build field list: replace MeasureValues/MeasureNames with actual measure fields
  const fieldsForQuery: Field[] = [];
  
  // Add dimension fields and non-measure fields (excluding synthetic fields)
  for (const field of allFields) {
    if (!isMeasureValuesField(field) && !isMeasureNamesField(field) && field.type === 'dimension') {
      fieldsForQuery.push(field);
    }
  }
  
  // Add all measure fields with the aggregation from MeasureValues
  const aggregation = measureValuesField?.aggregation || 'sum';
  for (const measureField of measureFields) {
    fieldsForQuery.push({
      ...measureField,
      aggregation: aggregation,
    });
  }
  
  // If colorField or sizeField are measures (not in measureFields), add them too
  if (colorField && colorField.type === 'measure' && !isSyntheticField(colorField)) {
    if (!measureFields.some(m => m.columnName === colorField.columnName)) {
      fieldsForQuery.push({
        ...colorField,
        aggregation: colorField.aggregation || 'sum',
      });
    }
  }
  if (sizeField && sizeField.type === 'measure' && !isSyntheticField(sizeField)) {
    if (!measureFields.some(m => m.columnName === sizeField.columnName)) {
      fieldsForQuery.push({
        ...sizeField,
        aggregation: sizeField.aggregation || 'sum',
      });
    }
  }

  // Build and execute single query with all measures
  let queryDesc: QueryDescription | null;
  
  if (fieldsForQuery.some(f => f.type === 'measure')) {
    queryDesc = buildAggregatedQuery({
      fields: fieldsForQuery,
      selectedTable,
      selectedDatabase,
      filterConfigurations: filteredFilterConfigurations,
      labelFields,
      tooltipFields,
      virtualTable,
      virtualColumns,
    });
  } else {
    queryDesc = buildRawQuery({
      fields: fieldsForQuery,
      selectedTable,
      selectedDatabase,
      filterConfigurations: filteredFilterConfigurations,
      labelFields,
      tooltipFields,
      virtualTable,
      virtualColumns,
    });
  }

  if (!queryDesc) {
    return {
      columns: [],
      rows: [],
      row_count: 0,
    };
  }

  // Execute query
  const result = await apiService.executeQuery(queryDesc, signal);
  
  // Transform result: convert measure columns into MeasureNames/MeasureValues rows
  return transformMeasuresToRows(result, measureFields, allFields);
}

/**
 * Transform query result from wide format (measures as columns) to long format
 * (measures as rows with MeasureNames and MeasureValues columns)
 * 
 * Input:  { species: 'Adelie', SUM(culmen_length_mm): 100, SUM(culmen_depth_mm): 50 }
 * Output: [
 *   { species: 'Adelie', MeasureNames: "culmen_length_mm", SUM(MeasureValues): 100 },
 *   { species: 'Adelie', MeasureNames: "culmen_depth_mm", SUM(MeasureValues): 50 }
 * ]
 */
function transformMeasuresToRows(
  result: QueryResult,
  measureFields: Field[],
  originalFields: Field[]
): QueryResult {
  const transformedRows: any[] = [];
  
  // Get all fields that should be copied to each row (dimensions + non-unpivoted measures)
  const fieldsToKeep = originalFields.filter(
    f => !isMeasureValuesField(f) && !isMeasureNamesField(f)
  );
  
  // Separate into dimensions and measures
  const dimensionFields = fieldsToKeep.filter(f => f.type === 'dimension');
  const otherMeasureFields = fieldsToKeep.filter(f => f.type === 'measure');
  
  // Get measure names being unpivoted
  const unpivotedMeasureNames = new Set(measureFields.map(f => f.columnName));
  
  // Find the MeasureValues field to get its aggregation
  const measureValuesField = originalFields.find(f => isMeasureValuesField(f));
  const aggregation = measureValuesField?.aggregation || 'sum';
  
  // The result column name for MeasureValues should match what chart expects
  // For a measure with aggregation, it's: AGG(columnName)
  const measureValuesColumnName = `${aggregation.toUpperCase()}(${MEASURE_VALUES_FIELD})`;
  
  // Get measure column names (with aggregation aliases)
  const measureColumnNames = measureFields.map(f => {
    // Find the result column name for this measure
    const col = result.columns.find(c => {
      // Match by base name (handles SUM(field), AVG(field), etc.)
      return c.name.includes(f.columnName);
    });
    return col ? col.name : f.columnName;
  });

  // Transform each row
  for (const row of result.rows) {
    // For each measure, create a new row
    for (let i = 0; i < measureFields.length; i++) {
      const measureField = measureFields[i];
      const measureColumnName = measureColumnNames[i];
      const measureValue = row[measureColumnName];

      // Skip if value is null/undefined
      if (measureValue == null) {
        continue;
      }

      const newRow: any = {};

      // Copy dimension values
      for (const dimField of dimensionFields) {
        const dimColumnName = getResultColumnName(dimField);
        newRow[dimColumnName] = row[dimColumnName];
      }
      
      // Copy other measure values (measures that aren't being unpivoted, like colorField/sizeField)
      for (const measureField of otherMeasureFields) {
        // Only copy if this measure is NOT one being unpivoted
        if (!unpivotedMeasureNames.has(measureField.columnName)) {
          const measureColumnName = getResultColumnName(measureField);
          newRow[measureColumnName] = row[measureColumnName];
        }
      }

      // Add synthetic columns with proper names
      newRow[MEASURE_NAMES_FIELD] = measureField.columnName;
      newRow[measureValuesColumnName] = measureValue;

      transformedRows.push(newRow);
    }
  }

  // Build new column list
  const newColumns: QueryResult['columns'] = [];
  
  // Add dimension columns
  for (const dimField of dimensionFields) {
    const dimColumnName = getResultColumnName(dimField);
    const origCol = result.columns.find(c => c.name === dimColumnName);
    if (origCol) {
      newColumns.push(origCol);
    }
  }
  
  // Add other measure columns (that aren't being unpivoted)
  for (const measureField of otherMeasureFields) {
    if (!unpivotedMeasureNames.has(measureField.columnName)) {
      const measureColumnName = getResultColumnName(measureField);
      const origCol = result.columns.find(c => c.name === measureColumnName);
      if (origCol) {
        newColumns.push(origCol);
      }
    }
  }
  
  // Add synthetic columns with proper names
  newColumns.push({ name: MEASURE_NAMES_FIELD, type: 'string' });
  newColumns.push({ name: measureValuesColumnName, type: 'float' });

  return {
    columns: newColumns,
    rows: transformedRows,
    row_count: transformedRows.length,
    query_sql: result.query_sql,
  };
}

/**
 * Check if the given fields require synthetic field handling
 * (i.e., contain MeasureValues or MeasureNames)
 */
export function requiresUnpivoting(fields: Field[]): boolean {
  return fields.some(field => isMeasureValuesField(field) || isMeasureNamesField(field));
}

