/**
 * Chart Type Classifier
 * 
 * Pure functions for detecting chart types and computing point budgets
 * for query optimization. Extracted from useQueryExecution for testability.
 */

import { QueryDescription, Field } from '../types';
import { getResultColumnName } from '../utils/fieldUtils';

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
  colorField?: Field | null
): ChartClassification {
  const hasMeasures = (queryDesc.measures?.length ?? 0) > 0;
  const dims = queryDesc.dimensions || [];

  // Tick strip: exactly 1 continuous dimension, no measures
  const isTickStrip =
    !hasMeasures &&
    dims.length === 1 &&
    (dims[0] as any)?.flavour === 'continuous';

  // True scatter: continuous dimension on both x AND y axes.
  // Note: can still include measures (e.g. continuous color/size).
  const isScatter =
    !!queryDesc.dimensions &&
    queryDesc.dimensions.some(d => d.axis === 'x' && d.flavour === 'continuous') &&
    queryDesc.dimensions.some(d => d.axis === 'y' && d.flavour === 'continuous');

  // Generic raw point chart: no measures with 2+ dimensions (categorical scatter, etc.)
  const isRawPointChart = !hasMeasures && dims.length >= 2;

  // Any of the above means we're rendering individual points
  const isPointChart = isTickStrip || isScatter || isRawPointChart;

  const hasDiscreteColor = !!colorField && colorField.flavour === 'discrete';

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
 * Find the best stratification field for budgeted sampling.
 * Priority:
 * 1. Discrete color field (best visual preservation)
 * 2. Discrete axis dimension or datetime-part selection
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

  // Otherwise, find a discrete axis dimension or datetime-part
  const discreteAxisDim =
    queryDesc.dimensions?.find(
      d => d.axis === 'x' && (d.flavour === 'discrete' || (d.date_part && d.date_mode))
    ) ||
    queryDesc.dimensions?.find(
      d => d.axis === 'y' && (d.flavour === 'discrete' || (d.date_part && d.date_mode))
    ) ||
    // Fallback: any discrete-like dimension
    queryDesc.dimensions?.find(
      d => d.flavour === 'discrete' || (d.date_part && d.date_mode)
    );

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
  colorField?: Field | null
): PointBudgetConfig {
  const { hasDiscreteColor, isScatter, isPointChart, isLineChart, continuousDimFields } = classification;

  // IMPORTANT: Check scatter plots FIRST, before line charts.
  // A scatter plot with aggregated measures (e.g., SUM for size encoding) has both
  // isScatter=true AND isLineChart=true, but it's still a point chart that needs
  // point budget limiting, not line budget.
  if (isScatter) {
    const maxPoints = hasDiscreteColor
      ? BUDGET_DEFAULTS.MAX_POINTS_WITH_DISCRETE_COLOR
      : BUDGET_DEFAULTS.MAX_POINTS_WITHOUT_DISCRETE_COLOR;

    const minPerStratum = hasDiscreteColor
      ? BUDGET_DEFAULTS.MIN_PER_STRATUM_WITH_DISCRETE_COLOR
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
      strategy: 'preserve_extremes',
      preserveFields,
    };
  }

  // For line charts (aggregated with dimensions), apply line budget
  // to limit result rows while preserving min/max for stable axis scales
  // Only preserve extremes for continuous dimensions (both X and Y axes in cartesian grid)
  if (isLineChart && continuousDimFields.length > 0) {
    return {
      maxPoints: Infinity,  // Not a point chart
      minPerStratum: 0,
      strategy: 'none',
      lineBudgetMaxRows: BUDGET_DEFAULTS.MAX_POINTS_WITHOUT_DISCRETE_COLOR,
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
    ? BUDGET_DEFAULTS.MAX_POINTS_WITH_DISCRETE_COLOR
    : BUDGET_DEFAULTS.MAX_POINTS_WITHOUT_DISCRETE_COLOR;

  const minPerStratum = hasDiscreteColor
    ? BUDGET_DEFAULTS.MIN_PER_STRATUM_WITH_DISCRETE_COLOR
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
  colorField?: Field | null
): QueryDescription {
  const classification = classifyChartType(queryDesc, colorField);
  
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

