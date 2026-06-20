// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, QueryResult, FieldOverrideState, UserChartType, DistributionVariant, TooltipField, LineVariant, DensityParams, ColorChannel } from '../types';
import { OverlayConfig } from './overlays/types';
import { FieldOverrideTarget } from './utils/fieldOverrides';
import { ColorScaleInfo } from './utils/colorSchemeUtils';
import { ChartTypeOverrides } from './helpers/chartTypeResolver';
import type { ViewSpec } from '../viewPlanner/types';
import * as Plot from '@observablehq/plot';

/** Gantt zoom range representing the visible data range on the timeline axis */
export interface GanttZoomRange {
  min: number;
  max: number;
}

export interface CategoryAxisDescriptor {
  axis: 'x' | 'y';
  columnName: string;
  domain?: any[];
}

/**
 * Shared domain information for consistent scales across charts.
 * This consolidates domain types previously passed separately.
 */
export interface SharedDomains {
  /** Measure domains keyed by column name (includes 0 with headroom) */
  measure: Record<string, [number, number]>;
  /** Numeric domains for continuous dimensions (without 0 inclusion) */
  numeric: Record<string, [number, number] | [Date, Date]>;
  /** Categorical domains for discrete fields */
  categorical: Record<string, any[]>;
  /** Pre-computed color scale info */
  colorScale?: ColorScaleInfo | null;
}

/**
 * Label configuration for data labels on charts
 */
export interface LabelConfig {
  labelFields: Field[];
  labelsEnabled: boolean;
  samplingStrategy: 'auto' | 'all' | 'sample';
  samplingThreshold: number;
  sampleEvery: number;
  fontSize: number;
}

/**
 * Configuration for generating cartesian plot grids.
 * Replaces positional parameters with a structured config object.
 */
export interface CartesianPlotsConfig {
  data: any[];
  xCandidates: Field[];
  yCandidates: Field[];
  sharedDomains: SharedDomains;
  encoding?: {
    color?: ColorChannel;
    size?: { field?: Field; range?: [number, number]; manual?: number; scaleData?: any[] };
    shape?: { field?: Field; manual?: string };
  };
  labels?: LabelConfig;
  tooltipFields?: Field[];
  facetFields?: Field[];
  overrides?: ChartTypeOverrides;
  fieldOverrides?: Record<string, FieldOverrideState>;
  fieldOverrideTargets?: FieldOverrideTarget[];
  allFields?: Field[];
  globalChartType?: UserChartType | null;
  lineVariant?: LineVariant;
  areaFillOpacity?: number;
  lineColorMode?: import('../types').LineColorMode;
  distributionVariant?: DistributionVariant;
  measureValuesSourceFields?: Field[];
  bandThicknessScale?: number;
  ganttZoomRange?: GanttZoomRange | null;
  /** Statistical overlay configurations */
  overlays?: OverlayConfig[];
  xTickFormat?: (d: any) => string;
  yTickFormat?: (d: any) => string;
}

export interface ChartGenerationContext {
  xFields: Field[];
  yFields: Field[];
  /**
    * Grouped color encoding carrier. Optional so focused tests can construct
    * minimal contexts; runtime generation always provides it.
   */
  color?: ColorChannel;
  sizeField?: Field;
  sizeRange?: [number, number];
  manualSize?: number;
  bandThicknessScale?: number;
  // Shape encoding (scatter only, discrete only)
  shapeField?: Field;
  manualShape?: string;
  // Facet background encoding
  facetBackgroundField?: Field;
  facetBackgroundScheme?: string;
  facetBackgroundOpacity?: number;
  facetField?: Field;
  categoryAxisDescriptor?: CategoryAxisDescriptor;
  queryResult: QueryResult;
  // --- Category tick configuration (optional) ------------------------------
  xAxisTickHeightPx?: number | null;
  yAxisTickWidthPx?: number | null;
  xTickFormat?: (d: any) => string;
  yTickFormat?: (d: any) => string;
  // --- Label configuration (optional) --------------------------------------
  labelFields?: Field[];
  labelsEnabled?: boolean;
  labelSamplingStrategy?: 'auto' | 'all' | 'sample';
  labelSamplingThreshold?: number;
  labelSampleEvery?: number;
  labelFontSize?: number;
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
  /** Variant for the line chart family when globalChartType is 'line'. */
  lineVariant?: LineVariant;
  /** Fill opacity for area chart fills. */
  areaFillOpacity?: number;
  /** Continuous line color: along path vs one line per value. */
  lineColorMode?: import('../types').LineColorMode;
  /** Variant for the distribution chart family when globalChartType is 'tick'. */
  distributionVariant?: DistributionVariant;
  /**
   * Pager state for the 'table-refactor' chart type.
   * tablePage is the 0-based current page index over distinct row-tuples.
   * tablePageSize is the number of row-tuples per page (global user setting).
   * Both are ignored unless globalChartType === 'table-refactor'.
   */
  tablePage?: number;
  tablePageSize?: number;
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
  /**
   * Consolidated shared domains for chart generation.
   * When set, overrides separate domain computations.
   */
  sharedDomains?: SharedDomains;
  /** Axis domain sharing controls propagated from UI. */
  independentDomains?: { x?: boolean; y?: boolean };
  /**
   * Source measures contributing to MeasureValues synthetic field.
   * Used for applying per-measure overrides when rendering unpivoted data.
   */
  measureValuesSourceFields?: Field[];
  /**
   * Facet fields to display in tooltips for context.
   * These are the discrete dimensions used for faceting, shown at the top of tooltips.
   */
  facetFields?: Field[];
  /**
   * Gantt chart zoom range (null = full data range).
   * When set, the Gantt chart will display only this portion of the timeline axis.
   */
  ganttZoomRange?: GanttZoomRange | null;
  /**
   * Field display alias lookup map (columnName → displayAlias).
   * Used to show user-defined aliases in chart labels, legends, and tooltips.
   */
  fieldAliasLookup?: Record<string, string>;
  /** Statistical overlay configurations (regression, moving average, Bollinger bands) */
  overlays?: OverlayConfig[];
  /** KDE parameters when globalChartType is 'density'. */
  densityParams?: DensityParams;
  /** Canonical semantic view plan, shared with query planning when available. */
  viewSpec?: ViewSpec | null;
}

/**
 * Facet background info for a single plot cell
 */
export interface FacetBackgroundInfo {
  /** CSS background color with opacity applied, or null if not applicable */
  backgroundColor: string | null;
  /** Whether this facet has mixed values (multiple categories in the background field) */
  isMixed: boolean;
}

export interface PieSliceSpec {
  id: string;
  label: string;
  rawValue: any;
  value: number;
  percentage: number;
  color: string;
  labelLines: string[];
  tooltipFields: TooltipField[];
}

export interface PiePlotSpec {
  slices: PieSliceSpec[];
  total: number;
  measureLabel: string;
  colorLabel: string;
  radiusScale: number;
  emptyMessage?: string;
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
    renderer?: 'observable-plot' | 'pie-svg';
    pieSpec?: PiePlotSpec;
    position: { row: number; col: number; };
    /** Optional facet background info for this cell */
    facetBackground?: FacetBackgroundInfo;
    /** X-axis field for this cell (used by brush zoom to identify filter target) */
    xField?: Field;
    /** Y-axis field for this cell (used by brush zoom to identify filter target) */
    yField?: Field;
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
    /**
     * Ordered tuples of facet values in iteration order, parallel to the
     * facet field arrays. Used by hierarchical header rendering to compute
     * accurate spans (including for sparse facet spaces). Optional; when
     * absent, callers fall back to product-of-levels span math.
     */
    rowsOrderedValueTuples?: any[][];
    colsOrderedValueTuples?: any[][];
  };
} 