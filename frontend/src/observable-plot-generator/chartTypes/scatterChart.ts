import * as Plot from '@observablehq/plot';

/**
 * Scatter chart for continuous measure vs continuous measure or dimension.
 */
export function scatterChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  labels?: { x?: string; y?: string }
): Plot.PlotOptions {
  return {
    x: { label: labels?.x || xColumn, grid: true },
    y: { label: labels?.y || yColumn, grid: true },
    marks: [
      Plot.dot(data, { x: xColumn, y: yColumn, fill: 'steelblue', r: 4 }),
      Plot.ruleX([0]),
      Plot.ruleY([0]),
    ],
  };
}


