import { Field, QueryResult, FieldOverrideState, UserChartType } from '../types';
import { FieldOverrideTarget } from './utils/fieldOverrides';
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
  colorBias?: number;
  manualColor?: string;
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
  // --- Tooltip configuration (optional) ------------------------------------
  tooltipFields?: Field[];
  /**
   * Per-field chart overrides keyed by Field.id.
   * These are derived from visualization state and persisted with sheets.
   */
  fieldOverrides?: Record<string, FieldOverrideState>;
  /**
   * Global chart type override (applies to all charts when no per-field override is set).
   */
  globalChartType?: UserChartType | null;
  /**
   * Computed list of fields that are eligible for per-field overrides,
   * based on axis placement and continuous field counts.
   */
  fieldOverrideTargets?: FieldOverrideTarget[];
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
  /**
   * @deprecated Legacy format - use plots array instead. Will be removed in future version.
   * For backward compatibility only. All new code should return plots array.
   */
  options?: Plot.PlotOptions;
  /**
   * Array of plots with their positions in a grid layout.
   * Even single charts are represented as a 1x1 grid for consistency.
   */
  plots: Array<{
    id: string;
    title: string;
    options: Plot.PlotOptions;
    position: { row: number; col: number; };
  }>;
  sharedDomains?: {
    x?: any;
    y?: any;
    byMeasure?: Record<string, [number, number]>;
  };
  layout: {
    /** Grid layout type. 'single' is deprecated - use 1x1 grid instead */
    type: 'grid' | 'vertical' | 'horizontal';
    columns: number;
    rows: number;
    // Optional explicit track sizes for CSS grid rendering
    // number => pixels, 'fr' => fractional unit (defaults to 1fr)
    columnSizes: Array<number | 'fr'>;
    rowSizes: Array<number | 'fr'>;
    // Optional minimum sizes for resize constraints (based on categories * MIN_BAR_STEP_PX)
    // If not provided, falls back to absolute minimum (50px)
    minColumnSizes?: Array<number>;
    minRowSizes?: Array<number>;
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