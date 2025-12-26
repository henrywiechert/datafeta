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
  strategy: 'none' | 'random' | 'stratified';
}

/**
 * Default budget constants.
 * Conservative limits to prevent Observable Plot render failures.
 */
const BUDGET_DEFAULTS = {
  MAX_POINTS_WITH_DISCRETE_COLOR: 10_000,
  MAX_POINTS_WITHOUT_DISCRETE_COLOR: 30_000,
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

  return {
    isPointChart,
    isScatter,
    isTickStrip,
    isRawPointChart,
    hasDiscreteColor,
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
  if (!classification.isPointChart) {
    return {
      maxPoints: Infinity,
      minPerStratum: 0,
      strategy: 'none',
    };
  }

  const { hasDiscreteColor } = classification;

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
    },
  } as QueryDescription;
}

