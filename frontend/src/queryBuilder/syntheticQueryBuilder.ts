// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
function detectSyntheticFieldUsage(fields: Field[]): {
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
  shapeField = null,
  virtualTable = null,
  virtualColumns = [],
  optimizationHints = undefined,
  measureGroupMeasureNames,
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
  shapeField?: Field | null;
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: VirtualColumnDefinition[];
  optimizationHints?: any;
  measureGroupMeasureNames?: string[];
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
  if (shapeField && !isSyntheticField(shapeField)) {
    allFields.push(shapeField);
  }
  const { hasMeasureNames, hasMeasureValues, measureValuesField } = detectSyntheticFieldUsage(allFields);

  if (!hasMeasureValues && !hasMeasureNames) {
    throw new Error('Neither MeasureValues nor MeasureNames field found in query fields');
  }

  // Track synthetic filter IDs to remove from query filters (defensive)
  let measureNamesFieldId: string | undefined;
  let measureValuesFieldId: string | undefined;
  
  // Find MeasureNames filter and field ID (should no longer be used for selection)
  const measureNamesFilterEntry = Object.entries(appliedFilterConfigurations).find(
    ([fieldId, config]) => config.columnName === MEASURE_NAMES_FIELD
  );
  if (measureNamesFilterEntry) {
    measureNamesFieldId = measureNamesFilterEntry[0];
  }
  
  // Find MeasureValues field ID (in case it's filtered, though it shouldn't be)
  const measureValuesFilterEntry = Object.entries(appliedFilterConfigurations).find(
    ([fieldId, config]) => config.columnName === MEASURE_VALUES_FIELD
  );
  if (measureValuesFilterEntry) {
    measureValuesFieldId = measureValuesFilterEntry[0];
  }

  // Get actual measure fields to include
  const measureFields = getMeasureFieldsForUnpivot(availableFields, measureGroupMeasureNames);

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
  const measureFieldsForUnpivot = measureFields.map((measureField) => ({
    ...measureField,
    aggregation: aggregation,
  }));
  for (const measureField of measureFieldsForUnpivot) {
    fieldsForQuery.push(measureField);
  }

  const fieldKeySet = new Set(fieldsForQuery.map((field) => getResultColumnName(field)));

  // Add other non-synthetic measures (including those explicitly placed on axes)
  const otherMeasureFields = allFields.filter(
    field => field.type === 'measure' && !isSyntheticField(field)
  );
  for (const measureField of otherMeasureFields) {
    const measureWithAgg = {
      ...measureField,
      aggregation: measureField.aggregation || 'sum',
    };
    const key = getResultColumnName(measureWithAgg);
    if (!fieldKeySet.has(key)) {
      fieldsForQuery.push(measureWithAgg);
      fieldKeySet.add(key);
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

  // Attach optimization hints if provided
  if (optimizationHints) {
    queryDesc.optimization_hints = optimizationHints;
  }

  // Execute query using Arrow transport for efficiency
  const result = await apiService.executeQueryArrow(queryDesc, signal);
  
  // Transform result: convert measure columns into MeasureNames/MeasureValues rows
  const axisMeasureFields = [...xFields, ...yFields].filter(
    field => field.type === 'measure' && !isSyntheticField(field)
  );
  const axisMeasureColumnNames = new Set(
    axisMeasureFields.map((field) => getResultColumnName({
      ...field,
      aggregation: field.aggregation || 'sum',
    }))
  );

  return transformMeasuresToRows(
    result,
    measureFieldsForUnpivot,
    allFields,
    axisMeasureColumnNames
  );
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
  originalFields: Field[],
  axisMeasureColumnNames: Set<string>
): QueryResult {
  const transformedRows: any[] = [];
  
  // Get all fields that should be copied to each row (dimensions + non-unpivoted measures)
  const fieldsToKeep = originalFields.filter(
    f => !isMeasureValuesField(f) && !isMeasureNamesField(f)
  );
  
  // Separate into dimensions and measures
  const dimensionFields = fieldsToKeep.filter(f => f.type === 'dimension');
  const otherMeasureFields = fieldsToKeep.filter(f => f.type === 'measure');
  
  // Find the MeasureValues field to get its aggregation
  const measureValuesField = originalFields.find(f => isMeasureValuesField(f));
  const aggregation = measureValuesField?.aggregation || 'sum';
  
  // The result column name for MeasureValues should match what chart expects
  // For a measure with aggregation, it's: AGG(columnName)
  const measureValuesColumnName = `${aggregation.toUpperCase()}(${MEASURE_VALUES_FIELD})`;
  
  // Get measure column names (with aggregation aliases)
  const measureColumnNames = measureFields.map((field) => {
    const expected = getResultColumnName(field);
    const col = result.columns.find(c => c.name === expected);
    return col ? col.name : expected;
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
      // For axis measures, only copy once per original row to avoid duplication.
      const isPrimaryRow = i === 0;
      for (const measureField of otherMeasureFields) {
        const measureColumnName = getResultColumnName({
          ...measureField,
          aggregation: measureField.aggregation || 'sum',
        });
        if (axisMeasureColumnNames.has(measureColumnName) && !isPrimaryRow) {
          continue;
        }
        newRow[measureColumnName] = row[measureColumnName];
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
  
  // Add other measure columns (including explicitly placed measures)
  const addedColumns = new Set(newColumns.map(col => col.name));
  for (const measureField of otherMeasureFields) {
    const measureColumnName = getResultColumnName({
      ...measureField,
      aggregation: measureField.aggregation || 'sum',
    });
    if (addedColumns.has(measureColumnName)) {
      continue;
    }
    const origCol = result.columns.find(c => c.name === measureColumnName);
    if (origCol) {
      newColumns.push(origCol);
      addedColumns.add(measureColumnName);
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

