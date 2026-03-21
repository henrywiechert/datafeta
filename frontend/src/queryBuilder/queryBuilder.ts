import { Field, QueryDescription, Measure, OrderBy, Filter, FilterConfig, ColumnCasts, ColumnCastConfig, VirtualTableDefinition } from '../types';
import { getResultColumnName } from '../utils/fieldUtils';

/**
 * Extracts column casting configuration from fields
 * Returns a dictionary mapping column names to their casting config
 */
export const extractColumnCasts = (fields: Field[]): ColumnCasts | undefined => {
  const columnCasts: ColumnCasts = {};
  let hasCasts = false;

  fields.forEach(field => {
    if (field.castType) {
      const castConfig: ColumnCastConfig = {
        cast_type: field.castType,
      };
      if (field.castReplacement) {
        castConfig.replacement_pattern = field.castReplacement;
      }
      columnCasts[field.columnName] = castConfig;
      hasCasts = true;
    }
  });

  return hasCasts ? columnCasts : undefined;
};

/**
 * Converts filter configurations to backend Filter[] format
 */
export const convertFilterConfigsToFilters = (
  filterConfigs: Record<string, FilterConfig>
): Filter[] => {
  const filters: Filter[] = [];

  Object.values(filterConfigs).forEach(config => {
    if (config.type === 'discrete') {
      // For discrete filters, use 'in' or 'not in' depending on which list is shorter.
      // When excludedValues is available and shorter, use 'not in' to reduce query payload.
      // The backend handles NULL values specially for both operators.
      // Pure exclusion mode: when selectedValues is empty but excludedValues is set
      // (e.g. from table context menu "Exclude"), always use 'not in'.
      const selectedLen = config.selectedValues.length;
      const useExclusion = config.excludedValues
        && config.excludedValues.length > 0
        && (
          selectedLen === 0
          || (config.totalAvailableCount && config.excludedValues.length < selectedLen)
        );

      // No effective restriction: empty selection (without exclusion) or all values selected
      // when we know the full cardinality (totalAvailableCount from a non-partial value list).
      if (!useExclusion && selectedLen === 0) {
        return;
      }
      if (
        !useExclusion
        && config.totalAvailableCount != null
        && config.totalAvailableCount > 0
        && selectedLen === config.totalAvailableCount
      ) {
        return;
      }

      if (useExclusion) {
        const filter: Filter = {
          field: config.columnName,
          operator: 'not in',
          value: config.excludedValues!,
        };
        if (config.dateTimePart && config.dateTimeMode) {
          filter.date_part = config.dateTimePart;
          filter.date_mode = config.dateTimeMode;
        }
        filters.push(filter);
      } else if (selectedLen > 0) {
        const filter: Filter = {
          field: config.columnName,
          operator: 'in',
          value: config.selectedValues,
        };
        // Add datetime part information if present
        if (config.dateTimePart && config.dateTimeMode) {
          filter.date_part = config.dateTimePart;
          filter.date_mode = config.dateTimeMode;
        }
        filters.push(filter);
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
  labelFields = [],
  tooltipFields = [],
  virtualTable = null,
  virtualColumns = [],
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
  filterConfigurations?: Record<string, FilterConfig>;
  labelFields?: Field[];
  tooltipFields?: Field[];
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: import('../types').VirtualColumnDefinition[];
}): QueryDescription | null => {

  const defaultAggFor = (f: Field): Measure['aggregation'] => {
    // For continuous numeric measures, default to sum; for discrete measures, default to count.
    return f.flavour === 'continuous' ? 'sum' : 'count';
  };

  const dedupeByKey = <T,>(items: T[], keyFn: (t: T) => string): T[] => {
    const out: T[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      const key = keyFn(it);
      if (!seen.has(key)) {
        out.push(it);
        seen.add(key);
      }
    }
    return out;
  };

  // Merge tooltip fields with regular fields for dimension/measure extraction
  // Tooltip fields should be included in the query as dimensions
  const allFieldsForQuery = [...fields];
  for (const tf of tooltipFields) {
    // Avoid duplicate by columnName & date part alias uniqueness
    if (!allFieldsForQuery.some(f => f.columnName === tf.columnName && f.dateTimePart === tf.dateTimePart && f.dateTimeMode === tf.dateTimeMode)) {
      allFieldsForQuery.push(tf);
    }
  }

  const dimensions = dedupeByKey(
    allFieldsForQuery
    .filter((f) => f.type === 'dimension')
    .map((d) => ({
      field: d.columnName,
      flavour: d.flavour,
      axis: d.axis,  // Preserve axis information if present
      date_part: d.dateTimePart,  // Pass datetime part if present
      date_mode: d.dateTimeMode,  // Pass datetime mode if present
    })),
    // Dedupe by output column name (datetime parts produce distinct aliases)
    (dim) => (dim.date_part && dim.date_mode ? `${dim.field}_${dim.date_part}_${dim.date_mode}` : dim.field)
  );
  
  const measures: Measure[] = dedupeByKey(
    allFieldsForQuery
    .filter((f) => f.type === 'measure')
    .map((m) => ({
      field: m.columnName,
      aggregation: (m.aggregation || defaultAggFor(m)) as any,
      alias: getResultColumnName(m),
    })),
    (m) => m.alias
  );

  // Only run a query if there is at least one measure or dimension.
  if (!selectedTable || (dimensions.length === 0 && measures.length === 0)) {
    return null;
  }

  // Order by all dimensions to ensure deterministic series/category order and
  // left-to-right flow for continuous dimensions (e.g., line charts)
  const discreteDims = allFieldsForQuery.filter(f => f.type === 'dimension' && f.flavour === 'discrete');
  const continuousDims = allFieldsForQuery.filter(f => f.type === 'dimension' && f.flavour === 'continuous');
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

  // Extract column casting configuration
  const columnCasts = extractColumnCasts(allFieldsForQuery);

  const queryDesc: QueryDescription = {
    target_table: selectedTable,
    target_database: selectedDatabase,
    dimensions,
    measures,
    filters: filters.length > 0 ? filters : undefined,
    orderBy: orderBy.length > 0 ? orderBy : undefined,
    column_casts: columnCasts,
    label_fields: labelFields.length > 0 ? dedupeLabelFields(labelFields, fields) : undefined,
    virtual_table: virtualTable || undefined,
    virtual_columns: virtualColumns.length > 0 ? virtualColumns : undefined,
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
  labelFields = [],
  tooltipFields = [],
  virtualTable = null,
  virtualColumns = [],
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
  filterConfigurations?: Record<string, FilterConfig>;
  labelFields?: Field[];
  tooltipFields?: Field[];
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: import('../types').VirtualColumnDefinition[];
}): QueryDescription | null => {
  if (!selectedTable || fields.length === 0) {
    return null;
  }

  // Treat all visualization fields + label fields + tooltip fields as simple columns to select.
  // Merge labelFields and tooltipFields so they are guaranteed present even if not on axes.
  const allRaw = [...fields];
  for (const lf of labelFields) {
    // Avoid duplicate by columnName & date part alias uniqueness
    if (!allRaw.some(f => f.columnName === lf.columnName && f.dateTimePart === lf.dateTimePart && f.dateTimeMode === lf.dateTimeMode)) {
      allRaw.push(lf);
    }
  }
  for (const tf of tooltipFields) {
    // Avoid duplicate by columnName & date part alias uniqueness
    if (!allRaw.some(f => f.columnName === tf.columnName && f.dateTimePart === tf.dateTimePart && f.dateTimeMode === tf.dateTimeMode)) {
      allRaw.push(tf);
    }
  }
  // Deduplicate on result column name (datetime part yields distinct alias)
  const uniqueFields = new Map<string, Field>();
  allRaw.forEach(f => {
    const key = getResultColumnName(f);
    if (!uniqueFields.has(key)) uniqueFields.set(key, f);
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
  const discreteDims = allRaw.filter(f => f.type === 'dimension' && f.flavour === 'discrete');
  const continuousDims = allRaw.filter(f => f.type === 'dimension' && f.flavour === 'continuous');
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

  // Extract column casting configuration
  const columnCasts = extractColumnCasts(fields);

  const queryDesc: QueryDescription = {
    target_table: selectedTable,
    target_database: selectedDatabase,
    dimensions,
    measures: [], // No server-side measures
    filters: filters.length > 0 ? filters : undefined,
    orderBy: orderBy.length > 0 ? orderBy : undefined,
    column_casts: columnCasts,
    label_fields: labelFields.length > 0 ? dedupeLabelFields(labelFields, fields) : undefined,
    virtual_table: virtualTable || undefined,
    virtual_columns: virtualColumns.length > 0 ? virtualColumns : undefined,
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
  
  if (hasMeasuresWithAggregation) return 'aggregated';

  // If measures are present on exactly one axis, the user intent is an aggregated chart
  // (bar/line). In that case we will apply a default aggregation.
  const xHasMeasure = fields.some(f => f.type === 'measure' && f.axis === 'x');
  const yHasMeasure = fields.some(f => f.type === 'measure' && f.axis === 'y');
  if (xHasMeasure !== yHasMeasure) return 'aggregated';

  return 'raw';
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
  labelFields = [],
  tooltipFields = [],
  virtualTable = null,
  virtualColumns = [],
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
  filterConfigurations?: Record<string, FilterConfig>;
  labelFields?: Field[];
  tooltipFields?: Field[];
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: import('../types').VirtualColumnDefinition[];
}): QueryDescription | null => {
  const queryType = getQueryTypeFromFields(fields);
  
  if (queryType === 'aggregated') {
    return buildAggregatedQuery({ fields, selectedTable, selectedDatabase, filterConfigurations, labelFields, tooltipFields, virtualTable, virtualColumns });
  } else {
    return buildRawQuery({ fields, selectedTable, selectedDatabase, filterConfigurations, labelFields, tooltipFields, virtualTable, virtualColumns });
  }
};

/**
 * Deduplicate label fields against existing visualization fields by columnName.
 * Order is not significant; return array of column names.
 */
function dedupeLabelFields(labelFields: Field[], existingFields: Field[]): string[] {
  // We need the backend to return every column referenced by labels.
  // If a label field already appears as a dimension/measure it will already be in SELECT, but
  // including it again in label_fields is harmless and keeps logic simple.
  // Preserve unique column names only.
  const result: string[] = [];
  const seen = new Set<string>();
  for (const lf of labelFields) {
    if (!seen.has(lf.columnName)) {
      result.push(lf.columnName);
      seen.add(lf.columnName);
    }
  }
  return result;
}
