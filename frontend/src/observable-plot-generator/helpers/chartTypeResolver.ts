import { DistributionVariant, Field, UserChartType } from '../../types';
export { isCdfAllowed } from '../../utils/cdfUtils';

// Cell-level chart types for a pair of fields
export type CellChartType = 'scatter' | 'line' | 'barX' | 'barY' | 'tickX' | 'tickY' | 'boxX' | 'boxY' | 'dot' | 'ganttX' | 'ganttY' | 'cdf';

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
    
    case 'tick':
      // Distribution orientation matches the axis of the continuous dimension.
      // The concrete variant decides whether we render a tick strip or a box plot.
      if (fieldAxis === 'x') {
        return distributionVariant === 'box-plot' ? 'boxX' : 'tickX';
      }
      return distributionVariant === 'box-plot' ? 'boxY' : 'tickY';
    
    case 'scatter':
      return 'scatter';
    
    case 'line':
      return 'line';

    case 'cdf':
      return 'cdf';
    
    case 'gantt':
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
    
    default:
      // Fallback to auto-detection
      return detectDefaultChartTypeForPair(xField, yField);
  }
}

