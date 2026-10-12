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

const MEASURING_ATTRIBUTE = 'data-chart-measuring';

/**
 * While a measurement is drawn or re-anchored, mark hover (tooltips,
 * highlights) is suppressed in EVERY chart cell — the pointer may cross into
 * other facets (see ChartGrid.module.css `html[data-chart-measuring]`).
 */
export function setMeasuringActive(active: boolean): void {
  const root = document.documentElement;
  if (active) root.setAttribute(MEASURING_ATTRIBUTE, '');
  else root.removeAttribute(MEASURING_ATTRIBUTE);
}

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
  /**
   * Data values of the two ends along the measured axis. The pixels above are
   * only valid for the domain they were computed against; these let the
   * measurement follow pan/zoom (see projectMeasurement).
   */
  leftValue: number;
  rightValue: number;
  /**
   * Cross-axis extent of the band, relative to the measuring cell, when the
   * measurement spans into other facet cells; absent = just this cell.
   */
  crossSpan?: CrossSpan;
  /** Set by projectMeasurement when an end lies outside the visible axis range (pixel clamped to the edge). */
  leftClamped?: boolean;
  rightClamped?: boolean;
}

/** Maps a data value on the measured axis to a pixel position, or null when unknown. */
export type MeasureProjector = (value: number) => number | null;

/**
 * Re-derive the pixel positions of a measurement from its values, clamped to
 * the plot's pixel range `[rangeStart, rangeEnd]`. Returns null when the whole
 * span is out of view.
 */
export function projectMeasurement(
  m: GanttMeasurementResult,
  project: MeasureProjector,
  rangeStart: number,
  rangeEnd: number,
): GanttMeasurementResult | null {
  const a = project(m.leftValue);
  const b = project(m.rightValue);
  if (a == null || b == null) return m;
  const lo = Math.min(rangeStart, rangeEnd);
  const hi = Math.max(rangeStart, rangeEnd);
  const [leftPx, rightPx, leftSnapped, rightSnapped] = a <= b
    ? [a, b, m.leftSnapped, m.rightSnapped]
    : [b, a, m.rightSnapped, m.leftSnapped];
  if (rightPx < lo || leftPx > hi) return null;
  return {
    ...m,
    leftPx: Math.max(lo, leftPx),
    rightPx: Math.min(hi, rightPx),
    leftSnapped,
    rightSnapped,
    leftClamped: leftPx < lo,
    rightClamped: rightPx > hi,
  };
}

/** A range along the cross (row/category) axis, in px relative to the measuring cell. */
export interface CrossSpan {
  start: number;
  end: number;
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
 * Edge positions of the measuring cell plus its facet peers (cells sharing the
 * measured axis' scale: same grid column for 'x', same grid row for 'y'),
 * shifted into the measuring cell's coordinates so a measurement can snap to
 * bars in other facets. Also returns each cell's cross-axis extent, for
 * stretching the band over the cells a measurement spans.
 */
export function buildFacetEdgePositions(
  origin: Element,
  peers: Element[],
  axis: GanttMeasureAxis,
): { positions: EdgePosition[]; cells: CrossSpan[] } {
  const o = origin.getBoundingClientRect();
  const positions: EdgePosition[] = [];
  const cells: CrossSpan[] = [];
  for (const el of [origin, ...peers.filter((p) => p !== origin)]) {
    const r = el.getBoundingClientRect();
    const dMeasure = axis === 'x' ? r.left - o.left : r.top - o.top;
    const dRow = axis === 'x' ? r.top - o.top : r.left - o.left;
    for (const p of buildEdgePositions(el, axis)) {
      positions.push({ measurePx: p.measurePx + dMeasure, rowPx: p.rowPx + dRow });
    }
    cells.push({ start: dRow, end: dRow + (axis === 'x' ? r.height : r.width) });
  }
  return { positions, cells };
}

/**
 * Union of the cells containing any of `rows` (cross-axis px relative to the
 * measuring cell, which is `cells[0]`). Undefined when that is just the
 * measuring cell itself.
 */
export function crossSpanForRows(cells: CrossSpan[], rows: number[]): CrossSpan | undefined {
  const own = cells[0];
  if (!own) return undefined;
  let start = own.start;
  let end = own.end;
  for (const row of rows) {
    const cell = cells.find((c) => row >= c.start && row <= c.end);
    if (!cell) continue;
    start = Math.min(start, cell.start);
    end = Math.max(end, cell.end);
  }
  return start === own.start && end === own.end ? undefined : { start, end };
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

  const [left, right, leftValue, rightValue] = a.px <= b.px ? [a, b, va, vb] : [b, a, vb, va];

  return {
    axis,
    leftPx: left.px,
    rightPx: right.px,
    leftSnapped: left.snapped,
    rightSnapped: right.snapped,
    label: formatFieldDistance(field, Math.abs(vb - va)),
    leftValue,
    rightValue,
  };
}


