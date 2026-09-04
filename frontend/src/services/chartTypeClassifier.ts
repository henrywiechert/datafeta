// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chart Type Classifier
 * 
 * Pure functions for detecting chart types and computing point budgets
 * for query optimization. Extracted from useQueryExecution for testability.
 */

import { QueryDescription, Field, QueryOptimizationSettings, DistributionVariant, LineColorMode } from '../types';
import { getResultColumnName } from '../utils/fieldUtils';
import { lineColorSplitsSeries } from '../utils/lineColorEncoding';

/**
 * Classification of a chart type based on query structure.
 */
export interface ChartClassification {
  /** Whether this chart renders individual points (scatter, tick strip, etc.) */
  isPointChart: boolean;
  /** True scatter: continuous dimension on both x and y axes */
  isScatter: boolean;
  /** Tick strip: single continuous dimension, no measures */
  isTickStrip: boolean;
  /** Raw point chart: no measures with 2+ dimensions */
  isRawPointChart: boolean;
  /** Whether the color field is discrete (affects budget) */
  hasDiscreteColor: boolean;
  /** Line chart: has measures with dimensions */
  isLineChart: boolean;
  /** All continuous dimension fields - for axis scale stability in cartesian grids */
  continuousDimFields: string[];
}

/**
 * Point budget configuration for limiting result set size.
 */
export interface PointBudgetConfig {
  /** Maximum number of points/rows to return */
  maxPoints: number;
  /** Minimum points per stratum when using stratified sampling */
  minPerStratum: number;
  /** Field to stratify by (for preserving distribution) */
  stratifyField?: string;
  /** Sampling strategy */
  strategy: 'none' | 'random' | 'stratified' | 'preserve_extremes';
  /** Fields to preserve min/max for (used with preserve_extremes strategy) */
  preserveFields?: string[];
  /** For line charts: max rows for aggregated result */
  lineBudgetMaxRows?: number;
  /** All continuous dimension fields to preserve extremes for (axis scale stability) */
  continuousFields?: string[];
}

/**
 * Default budget constants.
 * Conservative limits to prevent Observable Plot render failures.
 */
const BUDGET_DEFAULTS = {
  MAX_POINTS_WITH_DISCRETE_COLOR: 20_000,
  MAX_POINTS_WITHOUT_DISCRETE_COLOR: 50_000,
  MIN_PER_STRATUM_WITH_DISCRETE_COLOR: 200,
  MIN_PER_STRATUM_WITHOUT_DISCRETE_COLOR: 0,
} as const;

/**
 * Get the output column name for a dimension, accounting for datetime parts.
 * Backend aliases datetime parts as `${field}_${date_part}_${date_mode}`.
 */
export function getDimensionOutputName(dim: {
  field: string;
  date_part?: string;
  date_mode?: string;
}): string {
  if (dim?.date_part && dim?.date_mode) {
    return `${dim.field}_${dim.date_part}_${dim.date_mode}`;
  }
  return dim.field;
}

/**
 * Classify the chart type based on the query description.
 * 
 * @param queryDesc - The query description
 * @param colorField - Optional color field for discrete color detection
 * @returns Chart classification
 */
export function classifyChartType(
  queryDesc: QueryDescription,
  colorField?: Field | null,
  distributionVariant: DistributionVariant = 'tick-strip',
  lineColorMode: LineColorMode = 'alongPath',
): ChartClassification {
  const hasMeasures = (queryDesc.measures?.length ?? 0) > 0;
  const dims = queryDesc.dimensions || [];

  if (queryDesc.query_mode === 'box_plot' && (queryDesc.box_plot_fields?.length ?? 0) > 0) {
    return {
      isPointChart: false,
      isScatter: false,
      isTickStrip: false,
      isRawPointChart: false,
      hasDiscreteColor: lineColorSplitsSeries(colorField, lineColorMode),
      isLineChart: false,
      continuousDimFields: [],
    };
  }

  // Distribution chart: exactly 1 continuous dimension, no measures.
  // Box plots are built from the same raw row set and need the same
  // result-budget / sampled indicator behavior as tick strips.
  const isSingleContinuousDistribution =
    !hasMeasures &&
    dims.length === 1 &&
    (dims[0] as any)?.flavour === 'continuous';
  const isTickStrip = isSingleContinuousDistribution && distributionVariant === 'tick-strip';
  const isBoxPlot = isSingleContinuousDistribution && distributionVariant === 'box-plot';

  // True scatter: continuous dimension on both x AND y axes.
  // Note: can still include measures (e.g. continuous color/size).
  const isScatter =
    !!queryDesc.dimensions &&
    queryDesc.dimensions.some(d => d.axis === 'x' && d.flavour === 'continuous') &&
    queryDesc.dimensions.some(d => d.axis === 'y' && d.flavour === 'continuous');

  // Generic raw point chart: no measures with 2+ dimensions (categorical scatter, etc.)
  const isRawPointChart = !hasMeasures && dims.length >= 2;

  // Any of the above means we're rendering individual points
  const isPointChart = isTickStrip || isBoxPlot || isScatter || isRawPointChart;

  const hasDiscreteColor = lineColorSplitsSeries(colorField, lineColorMode);

  // Line chart: has measures with dimension(s)
  // This produces many data points that may need optimization
  // Apply line budget whenever we have measures + dimensions
  // The result can still have many rows even with discrete dimensions
  const isLineChart = hasMeasures && dims.length > 0;
  
  // Collect continuous dimensions for min/max preservation (axis scale stability).
  // IMPORTANT: 
  // 1. Use OUTPUT column names (datetime parts produce aliased columns)
  // 2. Exclude datetime dimensions with date_mode='distinct' - those produce
  //    discrete integers (day 1-31, hour 0-23), not continuous values
  const continuousDimFields = dims
    .filter(d => d.flavour === 'continuous' && d.date_mode !== 'distinct')
    .map(d => getDimensionOutputName(d));

  return {
    isPointChart,
    isScatter,
    isTickStrip,
    isRawPointChart,
    hasDiscreteColor,
    isLineChart,
    continuousDimFields,
  };
}

/**
 * Synthetic provenance columns injected by the union / virtual-table wrapper.
 *
 * They are always present so charts keep working when a union is removed, which
 * means on a single table they carry exactly one distinct value. Partitioning by
 * a single-valued column makes stratified sampling collapse into a plain global
 * random sample -- redrawn on every query, so whole categories drop in and out
 * of the chart. These columns are bookkeeping, never a visual encoding, so they
 * are never a useful stratum. The union builder already strips them from
 * `cdf_partition_fields` for the same reason.
 */
const SYNTHETIC_SOURCE_FIELDS = new Set(['_source_database', '_source_table']);

function isUsableStratum(dim: {
  field: string;
  flavour?: string;
  date_part?: string;
  date_mode?: string;
}): boolean {
  if (SYNTHETIC_SOURCE_FIELDS.has(dim.field)) return false;
  return dim.flavour === 'discrete' || !!(dim.date_part && dim.date_mode);
}

/** Last element matching a predicate, mirroring the renderer's `.slice(-1)[0]`. */
function findLast<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) return items[i];
  }
  return undefined;
}

/**
 * The band ("category") axis of a distribution chart -- tick strip or box plot.
 *
 * This must match what actually gets rendered, or the sampling protects bands
 * the chart never draws while the visible ones can be emptied out. chartRules
 * takes the LAST discrete dimension -- the same convention bar charts use for
 * their category -- from the axis OPPOSITE the continuous dimension
 * (`yDiscreteDims.slice(-1)[0]` / `xDiscreteDims.slice(-1)[0]`), falling back to
 * the continuous dimension's own axis when the opposite axis holds no dimensions
 * at all. Checking opposite-then-same reproduces both of those branches.
 *
 * Returns undefined when the shape is not a distribution chart -- notably a
 * scatter, which has continuous dimensions on both axes.
 *
 * Known divergence: when faceting supplies a `categoryAxisDescriptor`, that
 * overrides the band axis at render time. It lives on the chart-generation
 * context and is not derivable from the query description, so it cannot be
 * honoured here.
 */
function findDistributionCategoryDim(dims: any[]): any | undefined {
  const continuousAxes = new Set(
    dims.filter(d => d.flavour === 'continuous' && (d.axis === 'x' || d.axis === 'y')).map(d => d.axis)
  );
  if (continuousAxes.size !== 1) return undefined;

  const continuousAxis = continuousAxes.has('x') ? 'x' : 'y';
  const oppositeAxis = continuousAxis === 'x' ? 'y' : 'x';

  return (
    findLast(dims, d => d.axis === oppositeAxis && isUsableStratum(d)) ||
    findLast(dims, d => d.axis === continuousAxis && isUsableStratum(d))
  );
}

/**
 * Find the best stratification field for budgeted sampling.
 * Priority:
 * 1. Discrete color field (best visual preservation)
 * 2. The rendered category axis of a distribution chart (tick strip / box plot)
 * 3. Any discrete axis dimension or datetime-part selection
 *
 * Synthetic source columns are skipped entirely: returning undefined (and thus
 * plain random sampling) is no worse than partitioning by a constant, and it
 * lets a real category dimension win instead.
 *
 * @param queryDesc - The query description
 * @param colorField - Optional color field
 * @param hasDiscreteColor - Whether color field is discrete
 * @returns Field name to stratify by, or undefined
 */
export function findStratifyField(
  queryDesc: QueryDescription,
  colorField?: Field | null,
  hasDiscreteColor: boolean = false
): string | undefined {
  // Prefer discrete color field
  if (hasDiscreteColor && colorField) {
    return getResultColumnName(colorField);
  }

  const dims = queryDesc.dimensions || [];

  // Distribution charts: stratify by the band axis the renderer actually draws.
  const categoryDim = findDistributionCategoryDim(dims);
  if (categoryDim) {
    return getDimensionOutputName(categoryDim);
  }

  // Non-distribution point charts only: no continuous axis dimension at all, or
  // continuous on both axes (a scatter, where the strategy is preserve_extremes
  // and this field goes unused). There is no band axis to mirror here, so the
  // x-before-y order is the pre-existing arbitrary choice; the last match keeps
  // it consistent with the renderer's category convention.
  const discreteAxisDim =
    findLast(dims, d => d.axis === 'x' && isUsableStratum(d as any)) ||
    findLast(dims, d => d.axis === 'y' && isUsableStratum(d as any)) ||
    // Fallback: any discrete-like dimension
    findLast(dims, d => isUsableStratum(d as any));

  return discreteAxisDim ? getDimensionOutputName(discreteAxisDim as any) : undefined;
}

/**
 * Compute the point budget configuration for a chart.
 * 
 * @param classification - Chart classification from classifyChartType
 * @param queryDesc - The query description
 * @param colorField - Optional color field
 * @returns Point budget configuration
 */
export function computePointBudget(
  classification: ChartClassification,
  queryDesc: QueryDescription,
  colorField?: Field | null,
  optimizationSettings?: QueryOptimizationSettings
): PointBudgetConfig {
  const { hasDiscreteColor, isScatter, isPointChart, isLineChart, continuousDimFields } = classification;
  const dims = queryDesc.dimensions || [];
  const discreteAxisDims = dims.filter(
    (d: any) => d.axis && (d.flavour === 'discrete' || (d.date_part && d.date_mode))
  );
  const isFacetedCandidate =
    discreteAxisDims.length > 1 ||
    (discreteAxisDims.some((d) => d.axis === 'x') && discreteAxisDims.some((d) => d.axis === 'y'));

  const baseMaxPoints = optimizationSettings
    ? (isFacetedCandidate ? optimizationSettings.maxPointsFaceted : optimizationSettings.maxPointsSingle)
    : BUDGET_DEFAULTS.MAX_POINTS_WITHOUT_DISCRETE_COLOR;
  const discreteColorCap = optimizationSettings?.maxPointsWithDiscreteColor ?? BUDGET_DEFAULTS.MAX_POINTS_WITH_DISCRETE_COLOR;
  const minPerStratumDiscrete = optimizationSettings?.minPerStratumWithDiscreteColor ?? BUDGET_DEFAULTS.MIN_PER_STRATUM_WITH_DISCRETE_COLOR;
  const lineBudgetMaxRows = optimizationSettings?.lineBudgetMaxRows ?? BUDGET_DEFAULTS.MAX_POINTS_WITHOUT_DISCRETE_COLOR;

  // IMPORTANT: Check scatter plots FIRST, before line charts.
  // A scatter plot with aggregated measures (e.g., SUM for size encoding) has both
  // isScatter=true AND isLineChart=true, but it's still a point chart that needs
  // point budget limiting, not line budget.
  if (isScatter) {
    const maxPoints = hasDiscreteColor
      ? Math.min(baseMaxPoints, discreteColorCap)
      : baseMaxPoints;

    const minPerStratum = hasDiscreteColor
      ? minPerStratumDiscrete
      : BUDGET_DEFAULTS.MIN_PER_STRATUM_WITHOUT_DISCRETE_COLOR;

    const stratifyField = findStratifyField(queryDesc, colorField, hasDiscreteColor);

    // Get continuous dimension fields to preserve extremes for
    // Use OUTPUT column names and exclude date_mode='distinct' (discrete integers)
    const preserveFields = queryDesc.dimensions
      ?.filter(d => d.flavour === 'continuous' && d.date_mode !== 'distinct')
      .map(d => getDimensionOutputName(d)) || [];

    return {
      maxPoints,
      minPerStratum,
      stratifyField,
      strategy: preserveFields.length > 0 ? 'preserve_extremes' : 'random',
      preserveFields: preserveFields.length > 0 ? preserveFields : undefined,
    };
  }

  // For line charts (aggregated with dimensions), apply line budget to limit result rows.
  // Preserve min/max for continuous dimensions when present (stable axis scales);
  // fall back to plain random sampling when all dimensions are discrete/categorical.
  if (isLineChart) {
    return {
      maxPoints: Infinity,  // Not a point chart
      minPerStratum: 0,
      strategy: 'none',
      lineBudgetMaxRows,
      // May be empty for discrete-only line charts; applyLineBudgetSql handles that case
      continuousFields: continuousDimFields,
    };
  }

  if (!isPointChart) {
    return {
      maxPoints: Infinity,
      minPerStratum: 0,
      strategy: 'none',
    };
  }

  // Remaining point charts (tick strip, raw point chart, etc.)

  const maxPoints = hasDiscreteColor
    ? Math.min(baseMaxPoints, discreteColorCap)
    : baseMaxPoints;

  const minPerStratum = hasDiscreteColor
    ? minPerStratumDiscrete
    : BUDGET_DEFAULTS.MIN_PER_STRATUM_WITHOUT_DISCRETE_COLOR;

  const stratifyField = findStratifyField(queryDesc, colorField, hasDiscreteColor);

  return {
    maxPoints,
    minPerStratum,
    stratifyField,
    strategy: stratifyField ? 'stratified' : 'random',
  };
}

/**
 * Apply point budget to a query description if needed.
 * Returns a new query description with result_budget attached for point charts.
 * 
 * @param queryDesc - Original query description
 * @param colorField - Optional color field
 * @returns Query description with budget (or original if not a point chart)
 */
export function applyPointBudgetToQuery(
  queryDesc: QueryDescription,
  colorField?: Field | null,
  distributionVariant: DistributionVariant = 'tick-strip'
): QueryDescription {
  const classification = classifyChartType(queryDesc, colorField, distributionVariant);
  
  if (!classification.isPointChart) {
    return queryDesc;
  }

  const budget = computePointBudget(classification, queryDesc, colorField);

  return {
    ...queryDesc,
    result_budget: {
      max_rows: budget.maxPoints,
      strategy: budget.strategy,
      stratify_field: budget.stratifyField,
      min_per_stratum: budget.minPerStratum,
      preserve_fields: budget.preserveFields,
    },
  } as QueryDescription;
}

