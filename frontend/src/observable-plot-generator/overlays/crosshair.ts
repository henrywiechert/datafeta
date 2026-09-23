// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Crosshair Overlay Builder
 *
 * Guide lines through the data point nearest the pointer, with its x/y values
 * labelled at the frame edges and a ring around the point. Built on Plot's
 * `pointer` transform, which re-renders just these marks as the pointer moves.
 *
 * Plot ships a `crosshair` mark, but it is not usable here as-is:
 *  - it labels the values *outside* the frame (in the axis margins), and grid
 *    cells have zero margins with axes drawn separately, so the labels would be
 *    clipped away — these are drawn just inside the frame edges instead;
 *  - its marks receive pointer events, so sliding over them would fire
 *    `mouseleave` on the dot beneath and make the custom tooltip flicker —
 *    every mark here has `pointerEvents: none`.
 *
 * All marks share one pointer state per plot (Plot keys it by SVG), so they
 * snap to the same point, and clicking pins them together with the tooltip.
 */

import * as Plot from '@observablehq/plot';
import { OVERLAY_NO_HIGHLIGHT_CLASS, OverlayParams } from './types';
import { T } from '../../theme/tokens';
import { formatNumericTick } from '../utils/numericTickFormat';
import { formatDateTick } from '../utils/dateFormatUtils';
import { SERIES_LABEL_FONT_SIZE } from '../utils/seriesEndLabels';

/** How far (px) the pointer may be from a point and still snap to it. */
const SNAP_RADIUS_PX = 40;

function formatAxisValue(v: unknown): string {
  if (v instanceof Date) return formatDateTick(v);
  if (typeof v === 'number') return formatNumericTick(v);
  return v == null ? '' : String(v);
}

export function buildCrosshair(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
): Plot.Markish {
  const axes = params.crosshairAxes ?? 'both';
  const showLabels = params.showLabels ?? true;
  const showX = axes !== 'y';
  const showY = axes !== 'x';

  // 'x' only: snap by x alone (reads naturally on line charts); likewise 'y'.
  const pointer = axes === 'x' ? Plot.pointerX : axes === 'y' ? Plot.pointerY : Plot.pointer;
  const at = (options: Record<string, any>) => pointer({
    px: xCol,
    py: yCol,
    maxRadius: SNAP_RADIUS_PX,
    pointerEvents: 'none',
    className: `overlay-no-tooltip ${OVERLAY_NO_HIGHLIGHT_CLASS}`,
    ...options,
  } as any);

  const guide = { stroke: T.chartGuideLine, strokeWidth: 1, strokeDasharray: '3,3' };
  const label = {
    fill: T.chartGuideLine,
    fontSize: SERIES_LABEL_FONT_SIZE,
    fontWeight: 500,
    stroke: T.chartHalo,
    strokeWidth: 3,
    paintOrder: 'stroke',
  };

  const marks: Plot.Markish[] = [];
  if (showX) marks.push(Plot.ruleX(data, at({ x: xCol, ...guide })));
  if (showY) marks.push(Plot.ruleY(data, at({ y: yCol, ...guide })));
  marks.push(Plot.dot(data, at({ x: xCol, y: yCol, r: 5, fill: 'none', stroke: T.chartGuideLine, strokeWidth: 1.5 })));

  if (showLabels) {
    if (showX) {
      marks.push(Plot.text(data, at({
        x: xCol,
        text: (d: any) => formatAxisValue(d?.[xCol]),
        frameAnchor: 'bottom',
        lineAnchor: 'bottom',
        dy: -3,
        ...label,
      })));
    }
    if (showY) {
      marks.push(Plot.text(data, at({
        y: yCol,
        text: (d: any) => formatAxisValue(d?.[yCol]),
        frameAnchor: 'left',
        textAnchor: 'start',
        lineAnchor: 'bottom',
        dx: 3,
        dy: -2,
        ...label,
      })));
    }
  }

  return marks;
}
