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
  return {
    x: { label: labels?.x || xColumn, grid: true },
    y: { label: labels?.y || yColumn, grid: true },
    marks: [
      Plot.line(data, { x: xColumn, y: yColumn, stroke: 'steelblue' }),
      Plot.dot(data, { x: xColumn, y: yColumn, fill: 'steelblue', r: 2 }),
    ],
  };
}


