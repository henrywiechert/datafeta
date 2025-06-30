import { Field, QueryDescription, Measure } from '../types';
import { GridSpec } from '../spec-generator/specGenerator';

interface BuildQueryParams {
  xDimensions: Field[];
  yDimensions: Field[];
  xMeasures: Field[];
  yMeasures: Field[];
  selectedTable: string;
  selectedDatabase?: string;
}

export const buildQuery = ({
  xDimensions,
  yDimensions,
  xMeasures,
  yMeasures,
  selectedTable,
  selectedDatabase,
}: BuildQueryParams): QueryDescription | null => {
  if (
    !selectedTable ||
    (xDimensions.length === 0 &&
      yDimensions.length === 0 &&
      xMeasures.length === 0 &&
      yMeasures.length === 0)
  ) {
    return null;
  }

  const dimensions = [...xDimensions, ...yDimensions].map((d) => ({
    field: d.columnName,
    flavour: d.flavour,
  }));
  const measures: Measure[] = [...xMeasures, ...yMeasures].map((m) => ({
    field: m.columnName,
    aggregation: m.aggregation!,
    alias: `${m.aggregation!.toUpperCase()}(${m.columnName})`,
  }));

  const queryDesc: QueryDescription = {
    target_table: selectedTable,
    target_database: selectedDatabase,
    dimensions,
    measures,
  };

  return queryDesc;
};

interface BuildQueryFromSpecParams {
  gridSpec: GridSpec;
  selectedTable: string;
  selectedDatabase?: string;
}

export const buildQueryFromSpec = ({
  gridSpec,
  selectedTable,
  selectedDatabase,
}: BuildQueryFromSpecParams): QueryDescription | null => {
  const allFields = [
    gridSpec.cell.encoding.x,
    gridSpec.cell.encoding.y,
    ...gridSpec.facets.columns,
    ...gridSpec.facets.rows,
  ].filter((f): f is Field => f !== undefined);

  if (!selectedTable || allFields.length === 0) {
    return null;
  }

  const dimensions = allFields
    .filter((f) => f.type === 'dimension')
    .map((d) => ({
      field: d.columnName,
      flavour: d.flavour,
    }));
  
  const measures: Measure[] = allFields
    .filter((f) => f.type === 'measure')
    .map((m) => ({
      field: m.columnName,
      aggregation: m.aggregation!,
      alias: `${m.aggregation!.toUpperCase()}(${m.columnName})`,
    }));

  const queryDesc: QueryDescription = {
    target_table: selectedTable,
    target_database: selectedDatabase,
    dimensions,
    measures,
  };

  return queryDesc;
}
