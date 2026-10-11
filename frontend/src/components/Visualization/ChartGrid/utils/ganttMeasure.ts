// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Snap-to-edge-dot computation for Gantt span measurement (Alt/Option+drag).
 * Reads the invisible start/end dots ganttChart.ts renders alongside each bar
 * (see GANTT_EDGE_DOT_START_CLASS/GANTT_EDGE_DOT_END_CLASS) and resolves the
 * dragged pixel range to the nearest real bar boundaries on either side.
 */
import { Field } from '../../../../types';
import { BrushResult } from '../BrushOverlay';
import { GANTT_EDGE_DOT_START_CLASS, GANTT_EDGE_DOT_END_CLASS } from '../../../../observable-plot-generator/chartTypes/ganttEdgeDotClasses';
import { invertQuantitative, ScaleDescriptor } from '../../../../utils/scaleInversion';
import { formatFieldDistance } from './distanceFormat';

// Observable Plot applies a mark's `className` to its wrapping <g>, not to
// each generated <circle> — so the class-bearing element has no cx/cy of its
// own. Select the circles *inside* that group instead.
const EDGE_DOT_SELECTOR = `.${GANTT_EDGE_DOT_START_CLASS} circle, .${GANTT_EDGE_DOT_END_CLASS} circle`;

export interface GanttMeasurementResult {
  axis: 'x' | 'y';
  snappedStartPx: number;
  snappedEndPx: number;
  label: string;
}

/**
 * Among all start/end edge dots in `root`, return the one whose position
 * along `axis` (cx for 'x', cy for 'y') is closest to `targetPx`. Both start
 * and end dots are eligible targets, since measuring from one bar's end to
 * another bar's start is a valid use case, not just start-to-start.
 */
export function findNearestEdgeDot(root: Element, axis: 'x' | 'y', targetPx: number): Element | null {
  const attrName = axis === 'x' ? 'cx' : 'cy';
  const candidates = root.querySelectorAll(EDGE_DOT_SELECTOR);

  let best: Element | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const raw = candidate.getAttribute(attrName);
    if (raw == null) continue;
    const dist = Math.abs(Number(raw) - targetPx);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

/**
 * Compute a snapped Gantt measurement from a completed 'measure' gesture, or
 * null when snapping isn't possible (no edge dots found, or the plot element
 * doesn't expose Observable Plot's scale() accessor).
 */
export function computeGanttMeasurement(
  plotElement: SVGSVGElement | HTMLElement,
  brush: BrushResult,
  xField: Field | undefined,
  yField: Field | undefined,
): GanttMeasurementResult | null {
  if (brush.gesture !== 'measure') return null;

  const { axis } = brush;
  const attrName = axis === 'x' ? 'cx' : 'cy';
  const startDot = findNearestEdgeDot(plotElement, axis, brush.startPx);
  const endDot = findNearestEdgeDot(plotElement, axis, brush.endPx);
  if (!startDot || !endDot) return null;

  const startPx = Number(startDot.getAttribute(attrName));
  const endPx = Number(endDot.getAttribute(attrName));
  if (!Number.isFinite(startPx) || !Number.isFinite(endPx)) return null;

  const scaleFn = (plotElement as any).scale;
  if (typeof scaleFn !== 'function') return null;
  const scale: ScaleDescriptor | undefined = scaleFn(axis);
  if (!scale?.domain || !scale?.range) return null;

  const v1 = invertQuantitative(startPx, scale);
  const v2 = invertQuantitative(endPx, scale);
  const field = axis === 'x' ? xField : yField;

  return {
    axis,
    snappedStartPx: Math.min(startPx, endPx),
    snappedEndPx: Math.max(startPx, endPx),
    label: formatFieldDistance(field, Math.abs(v2 - v1)),
  };
}
