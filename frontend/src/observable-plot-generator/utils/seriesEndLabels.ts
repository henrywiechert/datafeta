// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Direct labelling of series ends ("one label per line"), shared by the line
 * chart builder and the MeasureValues multi-mark builder.
 *
 * Placement is a two-stage contract:
 *  1. Here (pure, no DOM): reserve gutter space on the independent axis and
 *     emit a single tagged `Plot.text` mark, one label per series.
 *  2. In the renderer (`deOverlapSeriesLabels`): resolve label-vs-label
 *     collisions in pixel space, which needs real text metrics and the final
 *     plot size — neither of which exists at generation time.
 *
 * Collision handling belongs entirely to stage 2: it is the only stage that
 * knows how tall a label actually is and how much room the axis has, so it
 * both spaces labels out and drops the ones that cannot fit. The `dodge` class
 * is what couples the two stages.
 */
import * as Plot from '@observablehq/plot';
import { T } from '../../theme/tokens';

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

/** Placement once 'end' has been resolved against the axis's ability to pad. */
export type SeriesEndLabelPlacement = 'end' | 'endInside';

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
    stroke: T.chartHalo,
    strokeWidth: 3,
    paintOrder: 'stroke',
    pointerEvents: 'none',
    className: `${SERIES_END_LABEL_CLASS} ${dodgeClass}`,
  } as any);
}
