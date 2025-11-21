import { Field, QueryDescription, QueryResult, FilterConfig, VirtualTableDefinition, VirtualColumnDefinition } from '../types';
import { buildAggregatedQuery, buildRawQuery } from './queryBuilder';
import { 
  isMeasureNamesField, 
  isMeasureValuesField, 
  getMeasureFieldsForUnpivot,
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
 * Build and execute unpivoted query for synthetic MeasureNames/MeasureValues fields
 * 
 * Strategy:
 * 1. Get list of measures to unpivot (filtered by MeasureNames if applicable)
 * 2. For each measure, build a separate query replacing MeasureValues with that measure
 * 3. Execute all queries in parallel
 * 4. Merge results, adding MeasureNames column to each row
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
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: VirtualColumnDefinition[];
  signal?: AbortSignal;
}): Promise<QueryResult> {
  // Detect synthetic field usage
  const allFields = [...xFields, ...yFields];
  const { hasMeasureNames, hasMeasureValues, measureValuesField } = detectSyntheticFieldUsage(allFields);

  if (!hasMeasureValues) {
    throw new Error('MeasureValues field not found in query fields');
  }

  // Get MeasureNames filter if it exists
  let measureNamesFilter: string[] | undefined;
  const measureNamesFilterConfig = Object.values(appliedFilterConfigurations).find(
    config => config.columnName === MEASURE_NAMES_FIELD
  );
  if (measureNamesFilterConfig && measureNamesFilterConfig.type === 'discrete') {
    measureNamesFilter = measureNamesFilterConfig.selectedValues;
  }

  // Get actual measure fields to unpivot
  const measureFields = getMeasureFieldsForUnpivot(availableFields, measureNamesFilter);

  if (measureFields.length === 0) {
    // No measures to unpivot - return empty result
    return {
      columns: [],
      rows: [],
      row_count: 0,
    };
  }

  // Remove MeasureNames and MeasureValues from filter configurations
  // (we'll handle MeasureNames filter ourselves, and MeasureValues doesn't exist in the data)
  const filteredFilterConfigurations = { ...appliedFilterConfigurations };
  delete filteredFilterConfigurations[MEASURE_NAMES_FIELD];
  delete filteredFilterConfigurations[MEASURE_VALUES_FIELD];

  // Build a query for each measure
  const queryPromises = measureFields.map(async (measureField) => {
    // Replace MeasureValues field with the actual measure field
    const fieldsForQuery = allFields.map(field => {
      if (isMeasureValuesField(field)) {
        // Replace MeasureValues with the actual measure, preserving aggregation settings
        return {
          ...measureField,
          id: field.id,
          aggregation: field.aggregation || measureField.aggregation || 'sum',
          axis: field.axis,
        };
      } else if (isMeasureNamesField(field)) {
        // Skip MeasureNames - we'll add it to the result later
        return null;
      }
      return field;
    }).filter((f): f is Field => f !== null);

    // Separate into x and y based on original axis
    const xFieldsForQuery = fieldsForQuery.filter(f => {
      const originalField = allFields.find(of => of.id === f.id);
      return xFields.some(xf => xf.id === (originalField?.id || f.id));
    });
    const yFieldsForQuery = fieldsForQuery.filter(f => {
      const originalField = allFields.find(of => of.id === f.id);
      return yFields.some(yf => yf.id === (originalField?.id || f.id));
    });

    // Determine if this should be an aggregated or raw query
    const hasMeasures = fieldsForQuery.some(f => f.type === 'measure');
    let queryDesc: QueryDescription | null;

    if (hasMeasures) {
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
      return { measureName: measureField.columnName, result: null };
    }

    // Execute query
    try {
      const result = await apiService.executeQuery(queryDesc, signal);
      return { measureName: measureField.columnName, result };
    } catch (error) {
      console.error(`Error executing query for measure ${measureField.columnName}:`, error);
      return { measureName: measureField.columnName, result: null, error };
    }
  });

  // Execute all queries in parallel
  const queryResults = await Promise.all(queryPromises);

  // Merge results
  return transformResultsForUnpivot(queryResults, measureValuesField!);
}

/**
 * Merge query results from individual measure queries into a single result
 * with MeasureNames and MeasureValues columns
 */
export function transformResultsForUnpivot(
  queryResults: Array<{ measureName: string; result: QueryResult | null; error?: any }>,
  measureValuesField: Field
): QueryResult {
  const mergedRows: any[] = [];
  let mergedColumns: QueryResult['columns'] = [];
  let firstResult: QueryResult | null = null;

  // Process each measure's results
  for (const { measureName, result, error } of queryResults) {
    if (!result || error) {
      continue;
    }

    // Use first valid result to determine column structure
    if (!firstResult) {
      firstResult = result;
      // Build merged column list (excluding the measure column, adding MeasureNames and MeasureValues)
      const measureColumnName = getResultColumnName(measureValuesField);
      mergedColumns = [
        ...result.columns.filter(col => col.name !== measureColumnName),
        { name: MEASURE_NAMES_FIELD, type: 'string' },
        { name: MEASURE_VALUES_FIELD, type: result.columns.find(col => col.name === measureColumnName)?.type || 'float' },
      ];
    }

    // Add MeasureNames column to each row
    for (const row of result.rows) {
      const measureColumnName = getResultColumnName(measureValuesField);
      const measureValue = row[measureColumnName];

      // Create new row with MeasureNames and MeasureValues
      const newRow: any = {};
      
      // Copy dimension columns
      for (const col of result.columns) {
        if (col.name !== measureColumnName) {
          newRow[col.name] = row[col.name];
        }
      }
      
      // Add synthetic columns
      newRow[MEASURE_NAMES_FIELD] = measureName;
      newRow[MEASURE_VALUES_FIELD] = measureValue;

      mergedRows.push(newRow);
    }
  }

  // Return merged result
  return {
    columns: mergedColumns,
    rows: mergedRows,
    row_count: mergedRows.length,
    query_sql: firstResult?.query_sql,
  };
}

/**
 * Check if the given fields require unpivoting (i.e., contain MeasureValues)
 */
export function requiresUnpivoting(fields: Field[]): boolean {
  return fields.some(field => isMeasureValuesField(field));
}

