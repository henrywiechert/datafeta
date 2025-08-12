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
  options?: Plot.PlotOptions; // Single plot (legacy)
  plots?: Array<{
    id: string;
    title: string;
    options: Plot.PlotOptions;
    position?: { row: number; col: number; };
  }>; // Multiple plots with shared axes
  sharedDomains?: {
    x?: any;
    y?: any;
  };
  layout?: {
    type: 'single' | 'grid' | 'vertical' | 'horizontal';
    columns?: number;
    rows?: number;
    // Optional explicit track sizes for CSS grid rendering
    // number => pixels, 'fr' => fractional unit (defaults to 1fr)
    columnSizes?: Array<number | 'fr'>;
    rowSizes?: Array<number | 'fr'>;
  };
} 