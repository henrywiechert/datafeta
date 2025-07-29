import { Field, QueryResult } from '../types';

export interface ChartGenerationContext {
  xFields: Field[];
  yFields: Field[];
  colorField?: Field;
  facetField?: Field;
  queryResult: QueryResult;
}

export interface PlotResult {
  library: 'observable-plot';
  plot: Element;
} 