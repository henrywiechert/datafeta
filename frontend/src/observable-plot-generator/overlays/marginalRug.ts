// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Marginal Rug Overlay Builder
 *
 * Short ticks along the bottom (x) and/or left (y) frame edge, one per plotted
 * point, showing each axis's distribution — clusters that overplotting hides
 * in the body of a scatter stand out along the edges.
 *
 * Ticks are `Plot.dot`s with a line-segment symbol anchored to the frame edge,
 * so their length is in pixels regardless of the scale's domain.
 *
 * Unlike the statistical overlays, this binds the rows the chart actually
 * renders (see `applyOverlays`): the ticks then match the sampled / normalised
 * points exactly, and their element indices resolve against the same array as
 * the chart's own marks, so series highlighting dims them with their series.
 */

import * as Plot from '@observablehq/plot';
import { OverlayParams } from './types';
import { DEFAULT_MANUAL_COLOR } from '../../config/colorSchemes';

/** Above this many rows, each rug keeps one tick per value bin (and group). */
export const RUG_THIN_THRESHOLD = 5_000;

/** Bins per axis when thinning — finer than any cell is wide, so no visible gaps. */
const RUG_BINS = 1_500;

function toNumber(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Rows to draw ticks for: every row with a numeric/time value, or — for large
 * inputs — one representative per value bin and group. Returns null when the
 * column is not continuous (a rug on a band axis is meaningless).
 */
export function selectRugRows(rows: any[], column: string, groupColumn?: string): Set<any> | null {
  let min = Infinity;
  let max = -Infinity;
  const numeric: any[] = [];
  for (const row of rows) {
    const v = toNumber(row?.[column]);
    if (v === null) continue;
    numeric.push(row);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (numeric.length === 0) return null;
  if (numeric.length <= RUG_THIN_THRESHOLD) return new Set(numeric);

  const span = max - min || 1;
  const seen = new Set<string>();
  const keep = new Set<any>();
  for (const row of numeric) {
    const bin = Math.min(RUG_BINS - 1, Math.floor(((toNumber(row[column]) as number) - min) / span * RUG_BINS));
    const key = groupColumn ? `${bin}|${String(row[groupColumn])}` : String(bin);
    if (seen.has(key)) continue;
    seen.add(key);
    keep.add(row);
  }
  return keep;
}

/** A segment from the dot's anchor into the frame; length is twice the dot radius. */
function segmentSymbol(axis: 'x' | 'y') {
  return {
    draw(context: CanvasPath, size: number) {
      const length = 2 * Math.sqrt(size / Math.PI);
      context.moveTo(0, 0);
      if (axis === 'x') context.lineTo(0, -length);
      else context.lineTo(length, 0);
    },
  };
}

export function buildMarginalRug(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  _orientation: 'x' | 'y',
  colorColumn?: string,
): Plot.Markish {
  const axes = params.rugAxes ?? 'both';
  const length = params.rugLength ?? 8;
  const color = params.color ?? DEFAULT_MANUAL_COLOR;
  const groupColumn = params.perGroup && colorColumn ? colorColumn : undefined;

  const rug = (axis: 'x' | 'y') => {
    const column = axis === 'x' ? xCol : yCol;
    const keep = selectRugRows(data, column, groupColumn);
    if (!keep) return null;
    // Bind the full array and filter, so element indices stay valid for
    // highlight stamping.
    return Plot.dot(data, {
      [axis]: column,
      filter: keep.size === data.length ? undefined : (row: any) => keep.has(row),
      frameAnchor: axis === 'x' ? 'bottom' : 'left',
      symbol: segmentSymbol(axis),
      r: length / 2,
      fill: 'none',
      stroke: groupColumn ?? color,
      strokeWidth: params.strokeWidth ?? 1,
      strokeOpacity: params.opacity ?? 0.35,
      className: 'overlay-no-tooltip',
    } as any);
  };

  const marks: Plot.Markish[] = [];
  if (axes !== 'y') {
    const x = rug('x');
    if (x) marks.push(x);
  }
  if (axes !== 'x') {
    const y = rug('y');
    if (y) marks.push(y);
  }
  return marks;
}
