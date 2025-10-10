import { Field, QueryDescription, Measure, OrderBy, Filter, FilterConfig } from '../types';
import { getResultColumnName } from '../utils/fieldUtils';

/**
 * Converts filter configurations to backend Filter[] format
 */
export const convertFilterConfigsToFilters = (
  filterConfigs: Record<string, FilterConfig>
): Filter[] => {
  const filters: Filter[] = [];

  Object.values(filterConfigs).forEach(config => {
    if (config.type === 'discrete') {
      // For discrete filters, use 'in' operator with selected values
      if (config.selectedValues.length > 0) {
        filters.push({
          field: config.columnName,
          operator: 'in',
          value: config.selectedValues,
        });
      }
    } else if (config.type === 'continuous') {
      // For continuous filters, add >= and <= operators
      if (config.min !== null) {
        filters.push({
          field: config.columnName,
          operator: '>=',
          value: config.min,
        });
      }
      if (config.max !== null) {
        filters.push({
          field: config.columnName,
          operator: '<=',
          value: config.max,
        });
      }
    } else if (config.type === 'datetime') {
      // For datetime filters, add >= and <= operators with date strings
      if (config.startDate !== null) {
        filters.push({
          field: config.columnName,
          operator: '>=',
          value: config.startDate,
        });
      }
      if (config.endDate !== null) {
        filters.push({
          field: config.columnName,
          operator: '<=',
          value: config.endDate,
        });
      }
    }
  });

  return filters;
};

/**
 * Builds a query that performs aggregations on the server.
 * This is used when the visualization requires summarization (e.g., bar charts).
 */
export const buildAggregatedQuery = ({
  fields,
  selectedTable,
  selectedDatabase,
  filterConfigurations = {},
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
  filterConfigurations?: Record<string, FilterConfig>;
}): QueryDescription | null => {

  const dimensions = fields
    .filter((f) => f.type === 'dimension')
    .map((d) => ({
      field: d.columnName,
      flavour: d.flavour,
      axis: d.axis,  // Preserve axis information if present
      date_part: d.dateTimePart,  // Pass datetime part if present
      date_mode: d.dateTimeMode,  // Pass datetime mode if present
    }));
  
  const measures: Measure[] = fields
    .filter((f) => f.type === 'measure')
    .map((m) => ({
      field: m.columnName,
      aggregation: m.aggregation!,
      alias: getResultColumnName(m),
    }));

  // Only run a query if there is at least one measure or dimension.
  if (!selectedTable || (dimensions.length === 0 && measures.length === 0)) {
    return null;
  }

  // Order by all dimensions to ensure deterministic series/category order and
  // left-to-right flow for continuous dimensions (e.g., line charts)
  const discreteDims = fields.filter(f => f.type === 'dimension' && f.flavour === 'discrete');
  const continuousDims = fields.filter(f => f.type === 'dimension' && f.flavour === 'continuous');
  // For datetime parts, use the alias name (fieldname_part_mode), otherwise use column name
  const orderBy: OrderBy[] = [...discreteDims, ...continuousDims].map(f => {
    // If this is a datetime part, order by the alias
    if (f.dateTimePart && f.dateTimeMode) {
      return { field: `${f.columnName}_${f.dateTimePart}_${f.dateTimeMode}` };
    }
    return { field: f.columnName };
  });
  
  // Convert filter configurations to filters
  const filters = convertFilterConfigsToFilters(filterConfigurations);

  const queryDesc: QueryDescription = {
    target_table: selectedTable,
    target_database: selectedDatabase,
    dimensions,
    measures,
    filters: filters.length > 0 ? filters : undefined,
    orderBy: orderBy.length > 0 ? orderBy : undefined,
  };

  return queryDesc;
};

/**
 * Builds a query when no aggregation is needed (e.g., scatter plots).
 * This function treats all fields as raw columns to be selected.
 */
export const buildRawQuery = ({
  fields,
  selectedTable,
  selectedDatabase,
  filterConfigurations = {},
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
  filterConfigurations?: Record<string, FilterConfig>;
}): QueryDescription | null => {
  if (!selectedTable || fields.length === 0) {
    return null;
  }

  // Treat all fields as simple columns to select.
  // Use a Set to handle cases where the same field is on multiple axes.
  // For datetime parts, use the full result column name (which includes part+mode) as the key
  // This ensures multiple datetime parts from the same field are not deduplicated
  const uniqueFields = new Map<string, Field>();
  fields.forEach(f => {
    const key = getResultColumnName(f);
    if (!uniqueFields.has(key)) {
      uniqueFields.set(key, f);
    }
  });

  const dimensions = Array.from(uniqueFields.values()).map(field => {
    return {
      field: field.columnName,
      flavour: field.flavour,
      axis: field.axis,  // Preserve axis information if present
      date_part: field.dateTimePart,  // Pass datetime part if present
      date_mode: field.dateTimeMode,  // Pass datetime mode if present
    }
  });

  // Order by dimensions when present; this preserves category order and sorts
  // continuous dimensions for left-to-right flows in single-series charts
  const discreteDims = fields.filter(f => f.type === 'dimension' && f.flavour === 'discrete');
  const continuousDims = fields.filter(f => f.type === 'dimension' && f.flavour === 'continuous');
  // For datetime parts, use the alias name (fieldname_part_mode), otherwise use column name
  const orderBy: OrderBy[] = [...discreteDims, ...continuousDims].map(f => {
    // If this is a datetime part, order by the alias
    if (f.dateTimePart && f.dateTimeMode) {
      return { field: `${f.columnName}_${f.dateTimePart}_${f.dateTimeMode}` };
    }
    return { field: f.columnName };
  });

  // Convert filter configurations to filters
  const filters = convertFilterConfigsToFilters(filterConfigurations);

  const queryDesc: QueryDescription = {
    target_table: selectedTable,
    target_database: selectedDatabase,
    dimensions,
    measures: [], // No server-side measures
    filters: filters.length > 0 ? filters : undefined,
    orderBy: orderBy.length > 0 ? orderBy : undefined,
  };

  return queryDesc;
};

/**
 * Determines the query type based on user's field configuration.
 * This is the new source of truth - user's field settings drive the query type,
 * not the chart strategy.
 */
export const getQueryTypeFromFields = (fields: Field[]): 'raw' | 'aggregated' => {
  // If any field is configured as a measure with aggregation, use aggregated query
  const hasMeasuresWithAggregation = fields.some(field => 
    field.type === 'measure' && field.aggregation
  );
  
  return hasMeasuresWithAggregation ? 'aggregated' : 'raw';
};

/**
 * Builds the appropriate query based on user's field configuration.
 * This replaces the chart-strategy-driven query building.
 */
export const buildQuery = ({
  fields,
  selectedTable,
  selectedDatabase,
  filterConfigurations = {},
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
  filterConfigurations?: Record<string, FilterConfig>;
}): QueryDescription | null => {
  const queryType = getQueryTypeFromFields(fields);
  
  if (queryType === 'aggregated') {
    return buildAggregatedQuery({ fields, selectedTable, selectedDatabase, filterConfigurations });
  } else {
    return buildRawQuery({ fields, selectedTable, selectedDatabase, filterConfigurations });
  }
};
