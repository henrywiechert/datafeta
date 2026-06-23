// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { DistributionVariant, Field, UserChartType } from '../../types/field';
import { analyzeFields } from '../analysis/fieldAnalysis';
export { isCdfAllowed } from '../../utils/cdfUtils';

// Cell-level chart types for a pair of fields
export type CellChartType = 'scatter' | 'line' | 'barX' | 'barY' | 'tickX' | 'tickY' | 'boxX' | 'boxY' | 'dot' | 'ganttX' | 'ganttY' | 'cdf' | 'density' | 'pie' | 'heatmap';

export type ChartTypeOverrides = {
  // Global fallback for all pairs when not overridden by field
  global?: CellChartType;
  // Override by field id (typically target the measure field in the pair)
  byFieldId?: Record<string, CellChartType>;
};

/**
 * Decide the default chart type for a given X/Y field pair.
 * Rules mirror existing cartesianGrid logic:
 * - measure vs measure → scatter
 * - measure vs continuous dimension → line (dimension along X, measure on Y)
 * - measure vs discrete dimension → bar (orientation according to measure axis)
 * - dimension vs dimension → scatter
 */
export function detectDefaultChartTypeForPair(xField: Field, yField: Field): CellChartType {
  const xIsMeasure = xField.type === 'measure';
  const yIsMeasure = yField.type === 'measure';

  if (xIsMeasure && yIsMeasure) {
    return 'scatter';
  }

  if (xIsMeasure && !yIsMeasure) {
    if (yField.flavour === 'continuous') return 'line'; // vertical line handled in renderer
    return 'barX';
  }

  if (!xIsMeasure && yIsMeasure) {
    if (xField.flavour === 'continuous') return 'line'; // standard horizontal line
    return 'barY';
  }

  // dimension vs dimension
  const xCont = xField.flavour === 'continuous';
  const yCont = yField.flavour === 'continuous';
  if (xCont && !yCont) return 'tickX';
  if (!xCont && yCont) return 'tickY';
  if (xCont && yCont) return 'scatter';
  // both discrete dimensions → categorical dot plot
  return 'dot';
}

/**
 * Resolve chart type applying optional overrides (per field or global).
 * If both fields have overrides, prioritize the measure's override; otherwise prefer Y, then X.
 */
export function resolveChartTypeForPair(
  xField: Field,
  yField: Field,
  overrides?: ChartTypeOverrides
): CellChartType {
  if (overrides) {
    const byId = overrides.byFieldId || {};
    const xOverride = byId[xField.id];
    const yOverride = byId[yField.id];

    // Prefer the measure's override if present
    const xIsMeasure = xField.type === 'measure';
    const yIsMeasure = yField.type === 'measure';

    if (xIsMeasure && xOverride) return xOverride;
    if (yIsMeasure && yOverride) return yOverride;

    // Otherwise prefer Y's override, then X
    if (yOverride) return yOverride;
    if (xOverride) return xOverride;

    if (overrides.global) return overrides.global;
  }

  return detectDefaultChartTypeForPair(xField, yField);
}

/**
 * Maps user-facing chart types to internal CellChartType based on field axis context.
 * 
 * User-facing types are simplified (4 options):
 * - 'line': line chart
 * - 'scatter': scatter/dot plot
 * - 'tick': tick strip (distribution)
 * - 'bar': bar chart
 * 
 * Internal CellChartType has orientation variants (barX/barY, tickX/tickY).
 * The mapping determines orientation based on which axis the overriding field is on.
 * 
 * @param userType - User-selected chart type
 * @param fieldAxis - Which axis ('x' or 'y') the field with the override is on
 * @param xField - The X-axis field in the pair
 * @param yField - The Y-axis field in the pair
 * @returns The appropriate CellChartType with correct orientation
 */
export function mapUserChartTypeToCellChartType(
  userType: UserChartType,
  fieldAxis: 'x' | 'y',
  xField: Field,
  yField: Field,
  distributionVariant: DistributionVariant = 'tick-strip'
): CellChartType {
  switch (userType) {
    case 'bar':
      // Bar orientation is determined by which axis has the measure
      // If the measure is on X, bars extend horizontally (barX)
      // If the measure is on Y, bars extend vertically (barY)
      if (fieldAxis === 'x') {
        return 'barX';
      }
      return 'barY';
    
    case 'tick': {
      // Distribution orientation matches the axis of the continuous dimension.
      // The concrete variant decides whether we render a tick strip or a box plot.
      const xIsContinuous = xField.flavour === 'continuous';
      const yIsContinuous = yField.flavour === 'continuous';
      if (xIsContinuous && !yIsContinuous) {
        return distributionVariant === 'box-plot' ? 'boxX' : 'tickX';
      }
      if (yIsContinuous && !xIsContinuous) {
        return distributionVariant === 'box-plot' ? 'boxY' : 'tickY';
      }
      if (fieldAxis === 'x') {
        return distributionVariant === 'box-plot' ? 'boxX' : 'tickX';
      }
      return distributionVariant === 'box-plot' ? 'boxY' : 'tickY';
    }
    
    case 'scatter':
      return 'scatter';
    
    case 'line':
      return 'line';

    case 'cdf':
      return 'cdf';

    case 'density':
      return 'density';

    case 'pie':
      return 'pie';

    case 'heatmap':
      return 'heatmap';
    
    case 'gantt': {
      // Gantt orientation: ganttX = horizontal (timeline on X axis), ganttY = vertical (timeline on Y axis)
      // Determine by which field is continuous (the timeline axis)
      // Unlike other charts, Gantt doesn't care about fieldAxis - it cares about which field is continuous
      const xIsContinuous = xField.flavour === 'continuous';
      const yIsContinuous = yField.flavour === 'continuous';
      
      // If X is continuous and Y is discrete (or both continuous), prefer ganttX (horizontal)
      if (xIsContinuous && !yIsContinuous) {
        return 'ganttX';
      }
      // If Y is continuous and X is discrete, use ganttY (vertical)
      if (yIsContinuous && !xIsContinuous) {
        return 'ganttY';
      }
      // Both continuous or both discrete - default to horizontal (ganttX)
      return 'ganttX';
    }
    
    default:
      // Fallback to auto-detection
      return detectDefaultChartTypeForPair(xField, yField);
  }
}

/**
 * Top-level "what should the auto chart be?" rule.
 *
 * Single source of truth for auto-detection of a `UserChartType`. Used both by
 * the chart-generation pipeline (to upgrade `globalChartType: null` to a
 * concrete type) and by the chart-type toggle UI (to highlight the auto-picked
 * button).
 *
 * Returns `null` when there is no signal (e.g. no fields on either axis); the
 * caller should treat that as "leave as auto / nothing to highlight".
 *
 * Resolution rules, in order:
 * 1. Heatmap shape: exactly 1 discrete dim on X, exactly 1 discrete dim on Y,
 *    no continuous dims, measure on color → `'heatmap'`.
 * 2. All-discrete shape: no continuous field (dimension or measure) on either
 *    axis → `'table-refactor'` (the Tableau-style text/symbol table). This is
 *    the same data-shape that used to route to the legacy AG Grid table.
 * 3. Both axes have at least one continuous candidate (measure or continuous
 *    dimension) → fall through to `detectDefaultChartTypeForPair` on the first
 *    candidate of each axis, mapped from `CellChartType` to `UserChartType`.
 * 4. No measures but has a continuous dimension somewhere → `'tick'`.
 * 5. Has measures → `'bar'`.
 * 6. Otherwise → `'scatter'`.
 *
 * Note: this is an auto-detection helper. The user's explicit toggle selection
 * (`globalChartType`) always takes precedence — callers should not invoke this
 * when `globalChartType` is set.
 */
export function detectDefaultUserChartType(
  xFields: Field[] | undefined,
  yFields: Field[] | undefined,
  colorField?: Field | null
): UserChartType | null {
  const xs = xFields || [];
  const ys = yFields || [];

  if (xs.length === 0 && ys.length === 0) {
    return null;
  }

  // 1. Heatmap: 1 discrete X dim, 1 discrete Y dim, measure on color.
  if (xs.length === 1 && ys.length === 1) {
    const xf = xs[0];
    const yf = ys[0];
    const xIsDiscreteDim =
      xf?.type === 'dimension' && xf.flavour === 'discrete';
    const yIsDiscreteDim =
      yf?.type === 'dimension' && yf.flavour === 'discrete';
    const colorIsMeasure = !!colorField && colorField.type === 'measure';
    if (xIsDiscreteDim && yIsDiscreteDim && colorIsMeasure) {
      return 'heatmap';
    }
  }

  // 3. Cartesian shape: continuous candidates on both axes → defer to per-pair.
  const xCandidates = xs.filter(
    (f) => f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
  );
  const yCandidates = ys.filter(
    (f) => f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
  );
  if (xCandidates.length > 0 && yCandidates.length > 0) {
    const cellType = detectDefaultChartTypeForPair(xCandidates[0], yCandidates[0]);
    if (cellType === 'barX' || cellType === 'barY') return 'bar';
    if (cellType === 'tickX' || cellType === 'tickY') return 'tick';
    if (cellType === 'dot') return 'scatter';
    if (cellType === 'ganttX' || cellType === 'ganttY') return 'gantt';
    if (cellType === 'scatter' || cellType === 'line') return cellType;
    return null;
  }

  // 3-5. Single-axis / dim-only fallbacks (mirrors prior FieldOverridesPanel logic).
  const analysis = analyzeFields(xs, ys);
  const xHasContinuousDim = analysis.xDimensions.some((d) => d.flavour === 'continuous');
  const yHasContinuousDim = analysis.yDimensions.some((d) => d.flavour === 'continuous');
  const hasMeasures = analysis.hasMeasure;

  if (!hasMeasures && (xHasContinuousDim || yHasContinuousDim)) return 'tick';
  if (hasMeasures) return 'bar';
  return 'scatter';
}

