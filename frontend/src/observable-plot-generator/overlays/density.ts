/**
 * Density Overlay Builder
 *
 * Wraps Observable Plot's density mark to render 2D kernel density estimation
 * contours on top of a scatter chart.
 *
 * Discrete colors: when `colorColumn` is provided and `perGroup` is enabled,
 * the density mark groups by that column so each category gets its own
 * contour set in the matching color, reusing the plot's shared color scale.
 *
 * Filled mode: when `filled` is true, contour bands are filled with
 * semi-transparent color. Lines-only mode (default) is cleaner when multiple
 * groups are overlaid.
 */

import * as Plot from '@observablehq/plot';
import { OverlayParams } from './types';

export function buildDensity(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  _orientation: 'x' | 'y',
  colorColumn?: string,
): Plot.Markish {
  const bandwidth  = params.bandwidth  ?? 30;
  const thresholds = params.thresholds ?? 10;
  const filled     = params.filled     ?? false;
  const fillOpacity = params.opacity   ?? 0.2;
  const strokeWidth = params.strokeWidth ?? 1.5;
  const color      = params.color      ?? '#4e79a7';
  const perGroup   = params.perGroup   ?? false;

  const useGroup = perGroup && !!colorColumn;

  const markOpts: any = {
    x: xCol,
    y: yCol,
    bandwidth,
    thresholds,
    strokeWidth,
    className: 'overlay-no-tooltip',
  };

  if (useGroup) {
    // Let Observable Plot use the shared categorical color scale already set up
    // by the scatter dots. Setting stroke/fill to the same column name means
    // Plot groups by it and assigns colors from the same 'color' scale.
    markOpts.stroke = colorColumn;
    if (filled) {
      markOpts.fill = colorColumn;
      markOpts.fillOpacity = fillOpacity;
    } else {
      markOpts.fill = 'none';
    }
  } else {
    // Single-color density over all data
    if (filled) {
      markOpts.fill = color;
      markOpts.fillOpacity = fillOpacity;
      markOpts.stroke = color;
    } else {
      markOpts.stroke = color;
      markOpts.fill = 'none';
    }
  }

  return Plot.density(data, markOpts);
}
