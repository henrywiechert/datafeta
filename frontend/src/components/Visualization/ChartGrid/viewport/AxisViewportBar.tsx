// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Zoom indicator for one external axis gutter track: a thin track spanning
 * the axis bounds with a thumb marking the live viewport, shown only while
 * the axis is zoomed. Double-click resets that axis.
 *
 * The viewport is keyed by column, so every gutter track of a shared column
 * (all facet columns on x, all facet rows on y) shows the same window.
 *
 * It sits on the OUTER edge of the gutter (away from the plot): the plot-side
 * edge borders the cells' frame, where the marginal rug overlay draws its
 * ticks. It is inset past the gutter-boundary resize handle's hit area.
 *
 * Gutters re-render on live viewport changes (useLiveViewportVersion), so the
 * bar follows a gesture without subscribing itself.
 */
import React from 'react';
import type * as Plot from '@observablehq/plot';
import { getViewportAxes } from '../../../../observable-plot-generator/viewport/chartViewport';
import { T } from '../../../../theme/tokens';
import type { ViewportController } from './viewportController';

/** Bar thickness and distance from the gutter's outer edge (px). */
const BAR_THICKNESS_PX = 3;
const BAR_INSET_PX = 2;

export interface AxisViewportWindow {
  column: string;
  /** Fractions of the bounds, 0..1, from the axis start (left on x, bottom on y). */
  start: number;
  end: number;
}

/** Live viewport of an axis as a fraction of its bounds; null when not zoomed. */
export function axisViewportWindow(
  options: Plot.PlotOptions | undefined,
  axis: 'x' | 'y',
  controller: ViewportController | undefined,
): AxisViewportWindow | null {
  const info = getViewportAxes(options)?.[axis];
  const bounds = info?.bounds;
  const range = info && controller?.get(info.column);
  if (!info || !bounds || !range) return null;
  const span = bounds.max - bounds.min;
  if (!(span > 0)) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const start = clamp((range.min - bounds.min) / span);
  const end = clamp((range.max - bounds.min) / span);
  if (!(end > start)) return null;
  return { column: info.column, start, end };
}

interface AxisViewportBarProps {
  options: Plot.PlotOptions | undefined;
  axis: 'x' | 'y';
  controller: ViewportController | undefined;
}

const AxisViewportBar: React.FC<AxisViewportBarProps> = ({ options, axis, controller }) => {
  const zoomWindow = axisViewportWindow(options, axis, controller);
  if (!zoomWindow || !controller) return null;
  const start = `${zoomWindow.start * 100}%`;
  const length = `${(zoomWindow.end - zoomWindow.start) * 100}%`;
  return (
    <div
      data-testid={`axis-viewport-bar-${axis}`}
      title="Zoomed — double-click to reset this axis"
      onDoubleClick={() => controller.clear([zoomWindow.column])}
      style={{
        position: 'absolute',
        ...(axis === 'x'
          ? { left: 0, right: 0, bottom: BAR_INSET_PX, height: BAR_THICKNESS_PX }
          : { top: 0, bottom: 0, left: BAR_INSET_PX, width: BAR_THICKNESS_PX }),
        borderRadius: BAR_THICKNESS_PX / 2,
        backgroundColor: T.accentTintStrong,
      }}
    >
      <div
        style={{
          position: 'absolute',
          ...(axis === 'x'
            ? { top: 0, bottom: 0, left: start, width: length }
            : { left: 0, right: 0, bottom: start, height: length }),
          // Keep a sliver visible when zoomed in very far.
          minWidth: BAR_THICKNESS_PX,
          minHeight: BAR_THICKNESS_PX,
          borderRadius: BAR_THICKNESS_PX / 2,
          backgroundColor: T.accentRing,
        }}
      />
    </div>
  );
};

export default AxisViewportBar;
