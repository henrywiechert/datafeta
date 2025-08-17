import { Field } from '../../types';

// Cell-level chart types for a pair of fields
export type CellChartType = 'scatter' | 'line' | 'barX' | 'barY' | 'tickX' | 'tickY' | 'dot';

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
    if (yField.flavour === 'continuous') return 'line';
    return 'barX';
  }

  if (!xIsMeasure && yIsMeasure) {
    if (xField.flavour === 'continuous') return 'line';
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


