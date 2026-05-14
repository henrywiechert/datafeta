// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Density Overlay Builder
 *
 * Wraps Observable Plot's density mark to render 2D kernel density estimation
 * contours on top of a scatter chart.
 *
 * Discrete colors: when `colorColumn` is provided and `perGroup` is enabled,
 * the density mark renders one Plot.density() per category so that each group
 * can carry a `data-cat` attribute (via stampColorCategories) and participate
 * in the series-highlight CSS dimming/restore logic.
 *
 * Filled mode: when `filled` is true, contour bands are filled with
 * semi-transparent color. Lines-only mode (default) is cleaner when multiple
 * groups are overlaid.
 */

import * as Plot from '@observablehq/plot';
import { OverlayParams } from './types';

/**
 * CSS class prefix written onto per-group density paths.
 * Imported by stampColorCategories to identify and stamp these elements.
 */
export const DENSITY_CAT_CLASS_PREFIX = 'density-grp-';

/**
 * Encode a category value to a URL-safe base64 string suitable for use as a
 * CSS class name suffix.  The corresponding decoder lives in stampColorCategories.ts.
 */
function encodeCatForClass(v: any): string {
  const key = v == null ? '__NULL__' : (v instanceof Date ? `__DATE__:${v.valueOf()}` : String(v));
  try {
    return btoa(unescape(encodeURIComponent(key)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  } catch {
    return key.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}

export function buildDensity(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  _orientation: 'x' | 'y',
  colorColumn?: string,
): Plot.Markish {
  const bandwidth   = params.bandwidth  ?? 30;
  const thresholds  = params.thresholds ?? 10;
  const filled      = params.filled     ?? false;
  const fillOpacity = params.opacity    ?? 0.2;
  const strokeWidth = params.strokeWidth ?? 1.5;
  const color       = params.color      ?? '#4e79a7';
  const perGroup    = params.perGroup   ?? false;

  const useGroup = perGroup && !!colorColumn;

  if (useGroup) {
    // Render one density mark per category so that each group's paths can be
    // stamped with `data-cat` by stampColorCategories (via DENSITY_CAT_CLASS_PREFIX).
    // Using stroke: colorColumn on per-group data lets Observable Plot resolve
    // the correct color from its shared categorical color scale.
    const groups = new Map<any, any[]>();
    for (const row of data) {
      const v = row[colorColumn!];
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v)!.push(row);
    }

    return Array.from(groups.entries()).map(([catValue, groupData]) => {
      const groupClass = `${DENSITY_CAT_CLASS_PREFIX}${encodeCatForClass(catValue)}`;
      return Plot.density(groupData, {
        x: xCol,
        y: yCol,
        bandwidth,
        thresholds,
        strokeWidth,
        stroke: colorColumn,
        fill: filled ? colorColumn : 'none',
        fillOpacity: filled ? fillOpacity : 0,
        className: `overlay-no-tooltip ${groupClass}`,
      } as any);
    }) as unknown as Plot.Markish;
  }

  // Single-color density over all data
  const markOpts: any = {
    x: xCol,
    y: yCol,
    bandwidth,
    thresholds,
    strokeWidth,
    className: 'overlay-no-tooltip',
    fill: filled ? color : 'none',
    fillOpacity: filled ? fillOpacity : 0,
    stroke: color,
  };

  return Plot.density(data, markOpts);
}
