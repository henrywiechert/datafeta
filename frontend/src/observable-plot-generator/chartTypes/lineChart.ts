import * as Plot from '@observablehq/plot';

/**
 * Line chart for continuous dimension on one axis and continuous measure on the other.
 * xColumn/yColumn are data column names in the query result to use.
 */
export function lineChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  labels?: { x?: string; y?: string }
): Plot.PlotOptions {
  // Filter to finite numeric values for y; x may be numeric or datetime/ordinal
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[yColumn]))
    : [];

  if (clean.length === 0) {
    return {
      marks: [
        Plot.text(['No numeric data for line chart'], { frameAnchor: 'middle', fontSize: 12, fill: 'gray' }),
      ],
    };
  }

  return {
    x: { label: labels?.x || xColumn, grid: true },
    y: { label: labels?.y || yColumn, grid: true },
    marks: [
      Plot.line(clean, { x: xColumn, y: yColumn, stroke: 'steelblue' }),
      Plot.dot(clean, { x: xColumn, y: yColumn, fill: 'steelblue', r: 2 }),
    ],
  };
}


