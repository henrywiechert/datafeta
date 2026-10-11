// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Snap-to-edge-dot computation for Gantt span measurement (Alt/Option+drag,
 * and the post-drag draggable handles). Reads the invisible start/end dots
 * ganttChart.ts renders alongside each bar (see GANTT_EDGE_DOT_START_CLASS/
 * GANTT_EDGE_DOT_END_CLASS) and resolves a pixel position to the nearest real
 * bar boundary — but ONLY within the row/category the pointer is currently
 * over, never across rows. If the pointer isn't close enough to a row (or
 * close enough to a specific edge within it), the point is reported
 * "free floating" (raw pixel position, not snapped) rather than forced onto
 * a possibly-unrelated bar.
 *
 * PERF NOTE: snapping runs on every pointermove during a live drag, so the
 * DOM is only queried ONCE per drag session (buildEdgePositions) and reused
 * via linear/binary search (snapWithinRow) — never re-querying the SVG per
 * move. A naive "query + scan every move" design is exactly the class of bug
 * fixed earlier in addTooltipListeners.ts; don't reintroduce it.
 */
import { Field } from '../../../../types';
import { GANTT_EDGE_DOT_START_CLASS, GANTT_EDGE_DOT_END_CLASS } from '../../../../observable-plot-generator/chartTypes/ganttEdgeDotClasses';
import { invertQuantitative, ScaleDescriptor } from '../../../../utils/scaleInversion';
import { formatFieldDistance } from './distanceFormat';

// Observable Plot applies a mark's `className` to its wrapping <g>, not to
// each generated <circle> — so the class-bearing element has no cx/cy of its
// own. Select the circles *inside* that group instead.
const EDGE_DOT_SELECTOR = `.${GANTT_EDGE_DOT_START_CLASS} circle, .${GANTT_EDGE_DOT_END_CLASS} circle`;

/** Within-row distance (px) a point must be from an edge dot to snap to it. */
const SNAP_DISTANCE_PX = 14;
/** Fallback row-lock threshold when the category scale's step isn't available. */
const DEFAULT_ROW_LOCK_THRESHOLD_PX = 24;

export type GanttMeasureAxis = 'x' | 'y';

export interface EdgePosition {
  /** Position along the measured (dragged) axis \u2014 cx for 'x', cy for 'y'. */
  measurePx: number;
  /** Position along the perpendicular/category axis \u2014 identifies which row/track this edge dot belongs to. */
  rowPx: number;
}

export interface SnapPoint {
  px: number;
  snapped: boolean;
}

export interface GanttMeasurementResult {
  axis: GanttMeasureAxis;
  leftPx: number;
  rightPx: number;
  leftSnapped: boolean;
  rightSnapped: boolean;
  label: string;
}

/**
 * Query every start/end edge dot in `root` once, returning both its
 * measured-axis and row-axis positions for repeated row-aware snapping
 * during a drag.
 */
export function buildEdgePositions(root: Element, axis: GanttMeasureAxis): EdgePosition[] {
  const measureAttr = axis === 'x' ? 'cx' : 'cy';
  const rowAttr = axis === 'x' ? 'cy' : 'cx';
  const candidates = root.querySelectorAll(EDGE_DOT_SELECTOR);
  const result: EdgePosition[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const measureRaw = candidates[i].getAttribute(measureAttr);
    const rowRaw = candidates[i].getAttribute(rowAttr);
    if (measureRaw == null || rowRaw == null) continue;
    const measurePx = Number(measureRaw);
    const rowPx = Number(rowRaw);
    if (Number.isFinite(measurePx) && Number.isFinite(rowPx)) {
      result.push({ measurePx, rowPx });
    }
  }

  return result;
}

/**
 * How close (in px, along the row/category axis) the pointer must be to a
 * row's center to be considered "in" that row — derived from the category
 * band's step (half a band width means every point inside the plotted rows
 * resolves to the row it's visually over) so this scales correctly with
 * zoom/thickness instead of using a single fixed guess.
 */
export function getRowLockThresholdPx(plotElement: SVGSVGElement | HTMLElement, axis: GanttMeasureAxis): number {
  const rowAxis: GanttMeasureAxis = axis === 'x' ? 'y' : 'x';
  const scaleFn = (plotElement as any).scale;
  if (typeof scaleFn === 'function') {
    const scale = scaleFn(rowAxis);
    if (scale && typeof scale.step === 'number' && Number.isFinite(scale.step)) {
      return scale.step / 2;
    }
  }
  return DEFAULT_ROW_LOCK_THRESHOLD_PX;
}

/**
 * Resolve a pointer position to either a snapped edge-dot position (within
 * the row the pointer is currently over, and within SNAP_DISTANCE_PX of a
 * real edge) or a free-floating raw position (pointer isn't close enough to
 * any row, or isn't close enough to a specific edge within its row).
 * Snapping never crosses rows: a bar in a different row is never considered,
 * however close it may be horizontally.
 */
export function snapWithinRow(
  positions: EdgePosition[],
  mouseMeasurePx: number,
  mouseRowPx: number,
  rowLockThresholdPx: number,
): SnapPoint {
  let nearestRowPx: number | null = null;
  let nearestRowDist = Infinity;
  for (const p of positions) {
    const d = Math.abs(p.rowPx - mouseRowPx);
    if (d < nearestRowDist) {
      nearestRowDist = d;
      nearestRowPx = p.rowPx;
    }
  }
  if (nearestRowPx == null || nearestRowDist > rowLockThresholdPx) {
    return { px: mouseMeasurePx, snapped: false };
  }

  const ROW_EPSILON_PX = 0.5;
  let bestPx: number | null = null;
  let bestDist = Infinity;
  for (const p of positions) {
    if (Math.abs(p.rowPx - nearestRowPx) > ROW_EPSILON_PX) continue;
    const d = Math.abs(p.measurePx - mouseMeasurePx);
    if (d < bestDist) {
      bestDist = d;
      bestPx = p.measurePx;
    }
  }

  if (bestPx == null || bestDist > SNAP_DISTANCE_PX) {
    return { px: mouseMeasurePx, snapped: false };
  }
  return { px: bestPx, snapped: true };
}

/**
 * Build the labeled measurement from two points (each either snapped or
 * free-floating, in no particular order), or null when the plot element
 * doesn't expose Observable Plot's scale() accessor.
 */
export function computeMeasurementFromPoints(
  plotElement: SVGSVGElement | HTMLElement,
  axis: GanttMeasureAxis,
  a: SnapPoint,
  b: SnapPoint,
  field: Field | undefined,
): GanttMeasurementResult | null {
  const scaleFn = (plotElement as any).scale;
  if (typeof scaleFn !== 'function') return null;
  const scale: ScaleDescriptor | undefined = scaleFn(axis);
  if (!scale?.domain || !scale?.range) return null;

  const va = invertQuantitative(a.px, scale);
  const vb = invertQuantitative(b.px, scale);

  const [left, right] = a.px <= b.px ? [a, b] : [b, a];

  return {
    axis,
    leftPx: left.px,
    rightPx: right.px,
    leftSnapped: left.snapped,
    rightSnapped: right.snapped,
    label: formatFieldDistance(field, Math.abs(vb - va)),
  };
}


