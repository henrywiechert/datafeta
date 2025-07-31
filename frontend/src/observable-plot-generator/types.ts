import { Field, QueryResult } from '../types';
import * as Plot from '@observablehq/plot';

export interface ChartGenerationContext {
  xFields: Field[];
  yFields: Field[];
  colorField?: Field;
  facetField?: Field;
  queryResult: QueryResult;
}

export interface PlotResult {
  library: 'observable-plot';
  options: Plot.PlotOptions;
} 