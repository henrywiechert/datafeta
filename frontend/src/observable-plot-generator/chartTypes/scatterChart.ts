import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';

/**
 * Scatter chart for continuous measure vs continuous measure or dimension.
 */
export function scatterChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  options?: { x?: string; y?: string; domain?: { x?: [number, number]; y?: [number, number] } }
): Plot.PlotOptions {
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[xColumn]) && Number.isFinite(d[yColumn]))
    : [];

  if (clean.length === 0) {
    // Render empty axes (no points) so the cell shape matches others
    return {
      x: { label: options?.x || xColumn, grid: true, domain: options?.domain?.x },
      y: { label: options?.y || yColumn, grid: true, domain: options?.domain?.y },
      marks: [Plot.ruleX([0]), Plot.ruleY([0])],
    };
  }

  return {
    // Provide labels and retain as keys for domain application
    x: { label: options?.x || xColumn, grid: true, domain: options?.domain?.x },
    y: { label: options?.y || yColumn, grid: true, domain: options?.domain?.y },
    marks: [
      Plot.dot(clean, { x: xColumn, y: yColumn, fill: DEFAULT_CHART_COLOR, r: 4 }),
      Plot.ruleX([0]),
      Plot.ruleY([0]),
    ],
  };
}


