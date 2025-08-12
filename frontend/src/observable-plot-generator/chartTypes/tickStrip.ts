import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';

/**
 * Tick-strip chart for a single continuous dimension.
 * Orientation rules:
 * - 'x': continuous dimension on X-axis → Plot.tickX
 * - 'y': continuous dimension on Y-axis → Plot.tickY
 */
export function tickStrip(
  context: ChartGenerationContext,
  orientation: 'x' | 'y',
  dimensionColumn: string
): Plot.PlotOptions {
  const { queryResult } = context;
  const data = queryResult.rows;

  // Guard against non-numeric values leading to rendering issues
  const hasValid = Array.isArray(data) && data.some((row) => Number.isFinite(row[dimensionColumn]));
  if (!hasValid) {
    return {
      marks: [
        Plot.text(['No numeric data for tick-strip'], {
          frameAnchor: 'middle',
          fontSize: 12,
          fill: 'gray',
        }),
      ],
    };
  }

  if (orientation === 'x') {
    return {
      x: { label: dimensionColumn, grid: true },
      y: { label: ' ' },
      marks: [
        Plot.tickX(data, {
          x: dimensionColumn,
        }),
      ],
    };
  }

  // orientation === 'y'
  return {
    y: { label: dimensionColumn, grid: true },
    x: { label: ' ' },
    marks: [
      Plot.tickY(data, {
        y: dimensionColumn,
      }),
    ],
  };
}


