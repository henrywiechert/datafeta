import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';

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
      // Thickness behaves like a single bar: fixed pixel height (1x)
      height: BAR_STEP_PX * 1.8,
      marks: [
        Plot.tickX(data, {
          x: dimensionColumn,
          stroke: DEFAULT_CHART_COLOR,
        }),
      ],
    };
  }

  // orientation === 'y'
  return {
    y: { label: dimensionColumn, grid: true },
    x: { label: ' ' },
    // Thickness behaves like a single bar: fixed pixel width (1x)
    width: BAR_STEP_PX * 1.8,
    marks: [
      Plot.tickY(data, {
        y: dimensionColumn,
        stroke: DEFAULT_CHART_COLOR,
      }),
    ],
  };
}


