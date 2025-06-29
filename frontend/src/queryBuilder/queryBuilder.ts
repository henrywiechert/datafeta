import { Field, QueryDescription, Measure } from '../types';

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

  const dimensions = [...xDimensions, ...yDimensions].map((d) => d.columnName);
  const measures: Measure[] = [...xMeasures, ...yMeasures].map((m) => ({
    field: m.columnName,
    aggregation: m.aggregation!,
    alias: `${m.columnName}_${m.aggregation}`,
  }));

  const queryDesc: QueryDescription = {
    target_table: selectedTable,
    target_database: selectedDatabase,
    dimensions,
    measures,
  };

  return queryDesc;
};
