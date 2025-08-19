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
  dimensionColumn: string,
  categoryDimensionColumn?: string
): Plot.PlotOptions {
  const { queryResult } = context;
  const data = queryResult.rows;

  // Guard against invalid values; accept numbers or dates (Date objects or parseable strings)
  const isNumericOrDate = (v: any) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    v instanceof Date ||
    (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  const hasValid = Array.isArray(data) && data.some((row) => isNumericOrDate(row[dimensionColumn]));
  if (!hasValid) {
    // Render empty axes so cell frame is consistent
    if (orientation === 'x') {
      return {
        x: { label: dimensionColumn, grid: true },
        y: { label: ' ' },
        height: BAR_STEP_PX * 1.8,
        marks: [],
      };
    } else {
      return {
        y: { label: dimensionColumn, grid: true },
        x: { label: ' ' },
        width: BAR_STEP_PX * 1.8,
        marks: [],
      };
    }
  }

  if (orientation === 'x') {
    if (categoryDimensionColumn) {
      const categoryCount = new Set(data.map((row: any) => row[categoryDimensionColumn])).size;
      return {
        x: { label: dimensionColumn, grid: true },
        y: { label: categoryDimensionColumn },
        height: Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX),
        marks: [
          Plot.tickX(data, {
            x: dimensionColumn,
            y: categoryDimensionColumn,
            stroke: DEFAULT_CHART_COLOR,
          }),
        ],
      };
    }
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
  if (categoryDimensionColumn) {
    const categoryCount = new Set(data.map((row: any) => row[categoryDimensionColumn])).size;
    return {
      y: { label: dimensionColumn, grid: true },
      x: { label: categoryDimensionColumn },
      width: Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX),
      marks: [
        Plot.tickY(data, {
          y: dimensionColumn,
          x: categoryDimensionColumn,
          stroke: DEFAULT_CHART_COLOR,
        }),
      ],
    };
  }
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


