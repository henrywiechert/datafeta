/**
 * Bollinger Bands Overlay Builder
 *
 * Wraps Observable Plot's bollingerY / bollingerX composite mark.
 * Renders a center moving average line with ±k·σ shaded band.
 */

import * as Plot from '@observablehq/plot';
import { OverlayParams } from './types';

export function buildBollingerBands(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  orientation: 'x' | 'y'
): Plot.Markish {
  const n = params.windowSize ?? 20;
  const k = params.bandWidth ?? 2;
  const color = params.color ?? '#59a14f';
  const opacity = params.opacity ?? 0.15;

  const markFn = orientation === 'y'
    ? Plot.bollingerY
    : Plot.bollingerX;

  return markFn(data, {
    x: xCol,
    y: yCol,
    n,
    k,
    color,
    opacity,
    stroke: color,
    strokeWidth: 1.5,
  });
}
