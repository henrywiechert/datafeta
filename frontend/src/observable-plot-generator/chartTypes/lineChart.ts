import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';

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
      x: { label: labels?.x || xColumn, grid: true },
      y: { label: labels?.y || yColumn, grid: true },
      marks: [],
    };
  }

  return {
    x: { label: labels?.x || xColumn, grid: true },
    y: { label: labels?.y || yColumn, grid: true },
    marks: [
      Plot.line(clean, { x: xColumn, y: yColumn, stroke: DEFAULT_CHART_COLOR }),
      Plot.dot(clean, { x: xColumn, y: yColumn, fill: DEFAULT_CHART_COLOR, r: 2 }),
    ],
  };
}


