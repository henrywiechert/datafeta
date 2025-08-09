import { Field, QueryDescription, Measure } from '../types';
import { VegaLiteSpec } from '../spec-generator/specGenerator';
import { getResultColumnName } from '../utils/fieldUtils';

/**
 * Builds a query that performs aggregations on the server.
 * This is used when the visualization requires summarization (e.g., bar charts).
 */
export const buildAggregatedQuery = ({
  fields,
  selectedTable,
  selectedDatabase,
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
}): QueryDescription | null => {

  const dimensions = fields
    .filter((f) => f.type === 'dimension')
    .map((d) => ({
      field: d.columnName,
      flavour: d.flavour,
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
  
  const queryDesc: QueryDescription = {
    target_table: selectedTable,
    target_database: selectedDatabase,
    dimensions,
    measures,
  };

  return queryDesc;
};

/**
 * Builds a query for use with Vega-Lite when no aggregation is needed (e.g., scatter plots).
 * This function treats all fields as raw columns to be selected.
 */
export const buildRawQuery = ({
  fields,
  selectedTable,
  selectedDatabase,
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
}): QueryDescription | null => {
  if (!selectedTable || fields.length === 0) {
    return null;
  }

  // Treat all fields as simple columns to select.
  // Use a Set to handle cases where the same field is on multiple axes.
  const uniqueColumnNames = new Set(fields.map((f) => f.columnName));

  const dimensions = Array.from(uniqueColumnNames).map(colName => {
    // We need to find the original field to get the flavour, but it's not critical
    // if we just default to discrete. The column name is the important part.
    const field = fields.find(f => f.columnName === colName)!;
    return {
      field: colName,
      flavour: field.flavour,
    }
  });

  const queryDesc: QueryDescription = {
    target_table: selectedTable,
    target_database: selectedDatabase,
    dimensions,
    measures: [], // No server-side measures
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
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
}): QueryDescription | null => {
  const queryType = getQueryTypeFromFields(fields);
  
  if (queryType === 'aggregated') {
    return buildAggregatedQuery({ fields, selectedTable, selectedDatabase });
  } else {
    return buildRawQuery({ fields, selectedTable, selectedDatabase });
  }
};
