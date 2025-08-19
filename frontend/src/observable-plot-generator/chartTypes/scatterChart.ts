import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';

/**
 * Scatter chart for continuous measure vs continuous measure or dimension.
 */
export function scatterChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  labels?: { x?: string; y?: string }
): Plot.PlotOptions {
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[xColumn]) && Number.isFinite(d[yColumn]))
    : [];

  if (clean.length === 0) {
    // Render empty axes (no points) so the cell shape matches others
    return {
      x: { label: labels?.x || xColumn, grid: true },
      y: { label: labels?.y || yColumn, grid: true },
      marks: [Plot.ruleX([0]), Plot.ruleY([0])],
    };
  }

  return {
    // Provide labels and retain as keys for domain application
    x: { label: labels?.x || xColumn, grid: true },
    y: { label: labels?.y || yColumn, grid: true },
    marks: [
      Plot.dot(clean, { x: xColumn, y: yColumn, fill: DEFAULT_CHART_COLOR, r: 4 }),
      Plot.ruleX([0]),
      Plot.ruleY([0]),
    ],
  };
}


