/**
 * Moving Average Overlay Builder
 *
 * Wraps Observable Plot's windowY / windowX transform applied to a line mark.
 * Renders a smoothed line using a rolling window function.
 */

import * as Plot from '@observablehq/plot';
import { OverlayParams } from './types';

export function buildMovingAverage(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  orientation: 'x' | 'y'
): Plot.Markish {
  const k = params.windowSize ?? 20;
  const reduce = params.reduce ?? 'mean';
  const anchor = params.anchor ?? 'middle';
  const color = params.color ?? '#4e79a7';
  const strokeWidth = params.strokeWidth ?? 2;

  const windowOpts = { k, reduce: reduce as Plot.WindowReducer, anchor };

  if (orientation === 'y') {
    return Plot.lineY(data, Plot.windowY(windowOpts, {
      x: xCol,
      y: yCol,
      stroke: color,
      strokeWidth,
      className: 'overlay-no-tooltip',
    }));
  }
  return Plot.lineX(data, Plot.windowX(windowOpts, {
    x: xCol,
    y: yCol,
    stroke: color,
    strokeWidth,
    className: 'overlay-no-tooltip',
  }));
}
