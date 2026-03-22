/**
 * Linear Regression Overlay Builder
 *
 * Wraps Observable Plot's linearRegressionY / linearRegressionX mark.
 * Renders an OLS regression line with optional confidence band.
 */

import * as Plot from '@observablehq/plot';
import { OverlayParams } from './types';

export function buildLinearRegression(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  orientation: 'x' | 'y'
): Plot.Markish {
  const ci = params.ci ?? 0.95;
  const color = params.color ?? '#e15759';
  const fillOpacity = params.opacity ?? 0.1;
  const strokeWidth = params.strokeWidth ?? 1.5;

  const markFn = orientation === 'y'
    ? Plot.linearRegressionY
    : Plot.linearRegressionX;

  return markFn(data, {
    x: xCol,
    y: yCol,
    ci,
    stroke: color,
    fill: color,
    fillOpacity,
    strokeWidth,
  });
}
