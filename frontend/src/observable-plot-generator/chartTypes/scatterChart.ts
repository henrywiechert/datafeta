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
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[xColumn]) && Number.isFinite(d[yColumn]))
    : [];

  if (clean.length === 0) {
    return {
      marks: [
        Plot.text(['No numeric data for scatter chart'], { frameAnchor: 'middle', fontSize: 12, fill: 'gray' }),
      ],
    };
  }

  return {
    x: { label: labels?.x || xColumn, grid: true },
    y: { label: labels?.y || yColumn, grid: true },
    marks: [
      Plot.dot(clean, { x: xColumn, y: yColumn, fill: 'steelblue', r: 4 }),
      Plot.ruleX([0]),
      Plot.ruleY([0]),
    ],
  };
}


