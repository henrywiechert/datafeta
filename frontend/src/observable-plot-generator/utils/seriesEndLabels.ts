// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Direct labelling of series ends ("one label per line"), shared by the line
 * chart builder and the MeasureValues multi-mark builder.
 *
 * Placement is a two-stage contract:
 *  1. Here (pure, no DOM): pick which series get a label, reserve gutter space
 *     on the independent axis, and emit a single tagged `Plot.text` mark.
 *  2. In the renderer (`deOverlapSeriesLabels`): resolve the remaining
 *     label-vs-label collisions in pixel space, which needs real text metrics
 *     and the final plot size — neither of which exists at generation time.
 *
 * Stage 1 therefore only thins labels it can prove collide in *data* space; the
 * DOM pass does the exact work. The `dodge` class is what couples the two.
 */
import * as Plot from '@observablehq/plot';

/** Applied to the label mark's `<g>` so the renderer's de-overlap pass can find it. */
export const SERIES_END_LABEL_CLASS = 'series-end-label';

/**
 * Axis along which the renderer may push labels apart. Horizontal charts stack
 * their end labels vertically; vertical charts spread them horizontally.
 */
export const SERIES_END_LABEL_DODGE_Y_CLASS = 'series-end-label-dodge-y';
export const SERIES_END_LABEL_DODGE_X_CLASS = 'series-end-label-dodge-x';

/** Beyond this many lines direct labelling becomes unreadable, so it is skipped. */
export const MAX_SERIES_LABELS = 12;

export const SERIES_LABEL_FONT_SIZE = 11;

/** Gap between the last point and its label, in pixels. */
const LABEL_OFFSET_PX = 6;

/**
 * Minimum separation between two labels on the dependent axis, as a fraction of
 * the dependent span. Below this they are guaranteed to collide at any plausible
 * plot height, so the smaller series is dropped rather than shifted.
 */
const MIN_SEPARATION_RATIO = 0.03;

/** Placement once 'end' has been resolved against the axis's ability to pad. */
export type SeriesEndLabelPlacement = 'end' | 'endInside';

function toNumeric(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  return null;
}

/**
 * Thin labels that provably overlap on the dependent axis.
 *
 * The renderer pushes surviving labels apart, but it can only borrow so much
 * room; dropping the hopeless cases here keeps that pass from cascading every
 * label down the axis. On collision the larger dependent value wins, which
 * keeps the topmost line of a bundle labelled.
 */
export function dropCollidingEndLabels(params: {
  endRows: any[];
  dependentColumn: string;
  dependentDomain?: [number, number] | [Date, Date];
  minSeparationRatio?: number;
}): any[] {
  const { endRows, dependentColumn, dependentDomain, minSeparationRatio = MIN_SEPARATION_RATIO } = params;
  if (endRows.length <= 1) return endRows;

  const valued = endRows
    .map((row) => ({ row, value: toNumeric(row?.[dependentColumn]) }))
    .filter((e): e is { row: any; value: number } => e.value != null);
  if (valued.length <= 1) return valued.map((e) => e.row);

  const domainMin = dependentDomain ? toNumeric(dependentDomain[0]) : null;
  const domainMax = dependentDomain ? toNumeric(dependentDomain[1]) : null;
  const span = domainMin != null && domainMax != null
    ? domainMax - domainMin
    : Math.max(...valued.map((e) => e.value)) - Math.min(...valued.map((e) => e.value));
  if (!(span > 0)) return [valued[0].row];

  const minGap = span * minSeparationRatio;
  // Descending: on a collision the higher value is the one already kept.
  const descending = valued.slice().sort((a, b) => b.value - a.value);
  const kept: typeof descending = [];
  for (const entry of descending) {
    const last = kept[kept.length - 1];
    if (!last || last.value - entry.value >= minGap) kept.push(entry);
  }
  return kept.map((e) => e.row);
}

/**
 * Extra headroom to reserve past the last point, as a fraction of the data span.
 *
 * Scaled by the longest label so long category names are not clipped in narrow
 * cells and short ones do not waste a fixed slice of the axis. The character
 * estimate is deliberately crude: the renderer measures the real text, this only
 * has to get the scale roughly right.
 */
export function estimateGutterRatio(labels: string[], fontSize = SERIES_LABEL_FONT_SIZE): number {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  if (longest === 0) return 0;
  // ~0.6em per character is a reasonable mean for proportional fonts.
  const estimatedPx = longest * fontSize * 0.6 + LABEL_OFFSET_PX;
  // Assume a cell is at least ~320px of plot area; clamp so a very long label
  // cannot eat more than a third of the axis.
  return Math.min(0.33, Math.max(0.08, estimatedPx / 320));
}

/**
 * One `Plot.text` mark holding every series-end label.
 *
 * 'end' places labels in the reserved gutter past the line; 'endInside' keeps
 * them within the data area, for axes that cannot be padded (ordinal/band).
 */
export function createSeriesEndLabelMark(params: {
  endRows: any[];
  placement: SeriesEndLabelPlacement;
  orientation: 'horizontal' | 'vertical';
  xColumn: string;
  yColumn: string;
  getText: (row: any) => string;
  getFill: (row: any) => string;
  fontSize?: number;
}): Plot.Markish {
  const { endRows, placement, orientation, xColumn, yColumn, getText, getFill, fontSize } = params;

  const outside = placement === 'end';
  const horizontal = orientation === 'horizontal';
  const dodgeClass = horizontal ? SERIES_END_LABEL_DODGE_Y_CLASS : SERIES_END_LABEL_DODGE_X_CLASS;

  return Plot.text(endRows, {
    x: xColumn,
    y: yColumn,
    text: getText,
    fill: getFill,
    textAnchor: horizontal ? (outside ? 'start' : 'end') : 'middle',
    dx: horizontal ? (outside ? LABEL_OFFSET_PX : -LABEL_OFFSET_PX) : 0,
    dy: horizontal ? 0 : (outside ? -8 : 10),
    fontSize: fontSize ?? SERIES_LABEL_FONT_SIZE,
    fontWeight: 500,
    stroke: 'white',
    strokeWidth: 3,
    paintOrder: 'stroke',
    pointerEvents: 'none',
    className: `${SERIES_END_LABEL_CLASS} ${dodgeClass}`,
  } as any);
}
