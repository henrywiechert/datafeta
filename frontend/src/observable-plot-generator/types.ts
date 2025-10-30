import { Field, QueryResult } from '../types';
import * as Plot from '@observablehq/plot';

export interface CategoryAxisDescriptor {
  axis: 'x' | 'y';
  columnName: string;
  domain?: any[];
}

export interface ChartGenerationContext {
  xFields: Field[];
  yFields: Field[];
  colorField?: Field;
  colorScheme?: string;
  sizeField?: Field;
  sizeRange?: [number, number];
  manualSize?: number;
  facetField?: Field;
  categoryAxisDescriptor?: CategoryAxisDescriptor;
  queryResult: QueryResult;
  // --- Label configuration (optional) --------------------------------------
  labelFields?: Field[];
  labelsEnabled?: boolean;
  labelSamplingStrategy?: 'auto' | 'all' | 'sample';
  labelSamplingThreshold?: number;
  labelSampleEvery?: number;
  /**
   * When provided, these shared domains will be used instead of computing new ones.
   * This is used by faceting to ensure all facets share the same Y-domain per measure.
   */
  sharedDomainsOverride?: {
    measure?: Record<string, [number, number]>;
    numeric?: Record<string, [number, number] | [Date, Date]>;
  };
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
    byMeasure?: Record<string, [number, number]>;
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
  // Optional global facet label metadata for rendering outer labels once (not per-plot)
  facetLabels?: {
    // Single-level (back-compat)
    rows?: { fieldLabel: string; values: any[] };
    cols?: { fieldLabel: string; values: any[] };
    groupSpan?: { columnsPerFacet: number; rowsPerFacet: number };
    // Multi-level (new)
    rowsLevels?: Array<{ fieldLabel: string; values: any[] }>;
    colsLevels?: Array<{ fieldLabel: string; values: any[] }>;
    spans?: { columns: number[]; rows: number[]; baseCols: number; baseRows: number };
  };
} 