// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
  orientation: 'x' | 'y',
  colorColumn?: string,
): Plot.Markish {
  const ci = params.ci ?? 0.95;
  const color = params.color ?? '#e15759';
  const fillOpacity = params.opacity ?? 0.1;
  const strokeWidth = params.strokeWidth ?? 1.5;
  const perGroup = params.perGroup ?? false;
  const showCI = params.showCI ?? true;

  const markFn = orientation === 'y'
    ? Plot.linearRegressionY
    : Plot.linearRegressionX;

  const useGroupColor = perGroup && !!colorColumn;

  return markFn(data, {
    x: xCol,
    y: yCol,
    ci: showCI ? ci : 0,
    stroke: useGroupColor ? colorColumn : color,
    fill: useGroupColor ? colorColumn : color,
    fillOpacity: showCI ? fillOpacity : 0,
    strokeWidth,
    className: 'overlay-no-tooltip',
  } as any);
}
