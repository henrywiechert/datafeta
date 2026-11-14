// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Moving Average Overlay Builder
 *
 * Wraps Observable Plot's windowY / windowX transform applied to a line mark.
 * Renders a smoothed line using a rolling window function. The window is a
 * percentage of the points per series, so it adapts to the data density.
 */

import * as Plot from '@observablehq/plot';
import { OverlayParams, normalizeSmoothing } from './types';
import { DEFAULT_MANUAL_COLOR } from '../../config/colorSchemes';

/**
 * Window size k for `points` values at a smoothing percentage: at least 2 so
 * there is something to average, at most `points` so the window fits.
 */
export function movingAverageWindow(points: number, smoothing: number | undefined): number {
  const k = Math.round((points * normalizeSmoothing(smoothing)) / 100);
  return Math.max(2, Math.min(k, points));
}

/** Average number of points per series the window slides over. */
function pointsPerSeries(data: any[], groupColumn?: string): number {
  if (!groupColumn) return data.length;
  const groups = new Set(data.map(d => d[groupColumn])).size;
  return groups > 0 ? Math.round(data.length / groups) : data.length;
}

export function buildMovingAverage(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  orientation: 'x' | 'y',
  colorColumn?: string,
): Plot.Markish {
  const reduce = params.reduce === 'median' ? 'median' : 'mean';
  const anchor = params.anchor ?? 'middle';
  const color = params.color ?? DEFAULT_MANUAL_COLOR;
  const strokeWidth = params.strokeWidth ?? 2;
  const perGroup = params.perGroup ?? false;

  const useGroupColor = perGroup && !!colorColumn;
  const k = movingAverageWindow(pointsPerSeries(data, useGroupColor ? colorColumn : undefined), params.smoothing);
  const windowOpts = { k, reduce: reduce as Plot.WindowReducer, anchor };

  if (orientation === 'y') {
    return Plot.lineY(data, Plot.windowY(windowOpts, {
      x: xCol,
      y: yCol,
      stroke: useGroupColor ? colorColumn : color,
      ...(useGroupColor ? { z: colorColumn } : {}),
      strokeWidth,
      className: 'overlay-no-tooltip',
    }));
  }
  return Plot.lineX(data, Plot.windowX(windowOpts, {
    x: xCol,
    y: yCol,
    stroke: useGroupColor ? colorColumn : color,
    ...(useGroupColor ? { z: colorColumn } : {}),
    strokeWidth,
    className: 'overlay-no-tooltip',
  }));
}
