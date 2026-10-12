// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Owns the full lifecycle of a Gantt span measurement: live snap-preview
 * while creating it (Alt/Option+drag), and — once created — dragging either
 * end to re-anchor it onto a different bar boundary (Perfetto/Chrome-tracing
 * style). Dismissed by a plain click in the chart cell or Escape.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Field } from '../../../../types';
import { BrushResult } from '../BrushOverlay';
import {
  buildFacetEdgePositions,
  computeMeasurementFromPoints,
  crossSpanForRows,
  getRowLockThresholdPx,
  setMeasuringActive,
  snapWithinRow,
  CrossSpan,
  EdgePosition,
  GanttMeasureAxis,
  GanttMeasurementResult,
  MeasureProjector,
  SnapPoint,
} from '../utils/ganttMeasure';

interface UseGanttMeasurementArgs {
  isGanttChart: boolean | undefined;
  getPlotElement: () => SVGSVGElement | HTMLElement | undefined;
  xField: Field | undefined;
  yField: Field | undefined;
  /**
   * Plot elements of the other facet cells sharing the measured axis (same
   * grid column for 'x', same row for 'y'); a measurement may span into them.
   */
  getPeerPlotElements?: (axis: GanttMeasureAxis) => Element[];
  /**
   * Current value → pixel mapping of the measured axis (follows pan/zoom).
   * The stored pixels of a measurement are only valid for the domain they were
   * measured against; re-anchoring starts from the projected position.
   */
  projectValue?: MeasureProjector;
}

interface EdgeIndex {
  axis: GanttMeasureAxis;
  positions: EdgePosition[];
  /** Cross-axis extent of each indexed cell; [0] is the measuring cell. */
  cells: CrossSpan[];
  rowLockThresholdPx: number;
}

interface HandleDragSession {
  axis: GanttMeasureAxis;
  draggedEnd: 'start' | 'end';
  fixed: SnapPoint;
  /** Cross span of the measurement before re-anchoring, kept while dragging. */
  crossSpan?: CrossSpan;
  index: EdgeIndex;
}

export interface UseGanttMeasurementResult {
  measurement: GanttMeasurementResult | null;
  /** Wire to BrushOverlay's onBrushMove — no-ops for non-'measure' gestures. */
  onBrushMove: (brush: BrushResult) => void;
  /** Wire to BrushOverlay's onBrushEnd — no-ops for non-'measure' gestures (caller still forwards 'zoom' itself). */
  onBrushEnd: (brush: BrushResult) => void;
  /** Wire to BrushOverlay's onDragStart — clears any existing measurement when a new gesture begins. */
  onDragStart: () => void;
  /** Wire to the cell's onClick — dismisses the measurement (unless the click immediately followed a gesture ending). */
  onCellClick: () => void;
  /** Wire to a grip element's onPointerDown to start re-anchoring that end. */
  onGripPointerDown: (end: 'start' | 'end') => (e: React.PointerEvent) => void;
}

function buildIndex(el: SVGSVGElement | HTMLElement, axis: GanttMeasureAxis, peers: Element[]): EdgeIndex {
  const { positions, cells } = buildFacetEdgePositions(el, peers, axis);
  return { axis, positions, cells, rowLockThresholdPx: getRowLockThresholdPx(el, axis) };
}

function unionSpans(a: CrossSpan | undefined, b: CrossSpan | undefined): CrossSpan | undefined {
  if (!a) return b;
  if (!b) return a;
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

export function useGanttMeasurement({
  isGanttChart,
  getPlotElement,
  xField,
  yField,
  getPeerPlotElements,
  projectValue,
}: UseGanttMeasurementArgs): UseGanttMeasurementResult {
  const [measurement, setMeasurement] = useState<GanttMeasurementResult | null>(null);
  const measurementRef = useRef(measurement);
  measurementRef.current = measurement;

  // Edge index for the IN-PROGRESS creation drag, built lazily on the first
  // move once the axis is known (rebuilt only if the axis changes).
  const creationIndexRef = useRef<EdgeIndex | null>(null);
  // Guards the click that immediately follows a gesture's pointerup from
  // also being interpreted as a "dismiss" click.
  const suppressNextClickRef = useRef(false);
  const dragSessionRef = useRef<HandleDragSession | null>(null);

  const field = useCallback((axis: GanttMeasureAxis) => (axis === 'x' ? xField : yField), [xField, yField]);

  const updateFromBrush = useCallback((brush: BrushResult) => {
    if (brush.gesture !== 'measure' || !isGanttChart) return;
    const el = getPlotElement();
    if (!el) return;

    if (!creationIndexRef.current || creationIndexRef.current.axis !== brush.axis) {
      creationIndexRef.current = buildIndex(el, brush.axis, getPeerPlotElements?.(brush.axis) ?? []);
    }
    const { positions, cells, rowLockThresholdPx } = creationIndexRef.current;

    const a = snapWithinRow(positions, brush.originAxisPx, brush.originCrossAxisPx, rowLockThresholdPx);
    const b = snapWithinRow(positions, brush.currentAxisPx, brush.currentCrossAxisPx, rowLockThresholdPx);
    const result = computeMeasurementFromPoints(el, brush.axis, a, b, field(brush.axis));
    setMeasurement(result && {
      ...result,
      crossSpan: crossSpanForRows(cells, [brush.originCrossAxisPx, brush.currentCrossAxisPx]),
    });
  }, [isGanttChart, getPlotElement, getPeerPlotElements, field]);

  const onBrushMove = useCallback((brush: BrushResult) => updateFromBrush(brush), [updateFromBrush]);

  const onBrushEnd = useCallback((brush: BrushResult) => {
    if (brush.gesture !== 'measure') return;
    updateFromBrush(brush);
    suppressNextClickRef.current = true;
  }, [updateFromBrush]);

  const onDragStart = useCallback(() => {
    creationIndexRef.current = null;
    setMeasurement(null);
  }, []);

  const onCellClick = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setMeasurement(null);
  }, []);

  // Escape dismisses an active measurement from anywhere (doesn't need focus
  // inside this specific cell — matches the plain-click dismissal scope).
  useEffect(() => {
    if (!measurement) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMeasurement(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [measurement]);

  const onGripPointerDown = useCallback((end: 'start' | 'end') => (e: React.PointerEvent) => {
    const current = measurementRef.current;
    const el = getPlotElement();
    if (!current || !el) return;
    e.stopPropagation();
    e.preventDefault();

    const axis = current.axis;
    const fixed: SnapPoint = end === 'start'
      ? { px: projectValue?.(current.rightValue) ?? current.rightPx, snapped: current.rightSnapped }
      : { px: projectValue?.(current.leftValue) ?? current.leftPx, snapped: current.leftSnapped };
    dragSessionRef.current = {
      axis,
      draggedEnd: end,
      fixed,
      crossSpan: current.crossSpan,
      index: buildIndex(el, axis, getPeerPlotElements?.(axis) ?? []),
    };

    // Suppress mark hover/tooltips (in all cells) while re-anchoring a
    // handle — this drag is driven here, not through BrushOverlay.
    setMeasuringActive(true);

    const toLocalPx = (ev: PointerEvent): { measurePx: number; rowPx: number } | null => {
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      return axis === 'x' ? { measurePx: x, rowPx: y } : { measurePx: y, rowPx: x };
    };

    const handleMove = (ev: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      const local = toLocalPx(ev);
      if (!local) return;
      const dragged = snapWithinRow(session.index.positions, local.measurePx, local.rowPx, session.index.rowLockThresholdPx);
      const result = computeMeasurementFromPoints(el, session.axis, dragged, session.fixed, field(session.axis));
      setMeasurement(result && {
        ...result,
        crossSpan: unionSpans(session.crossSpan, crossSpanForRows(session.index.cells, [local.rowPx])),
      });
    };

    const handleUp = () => {
      dragSessionRef.current = null;
      suppressNextClickRef.current = true;
      setMeasuringActive(false);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [getPlotElement, getPeerPlotElements, projectValue, field]);

  return { measurement, onBrushMove, onBrushEnd, onDragStart, onCellClick, onGripPointerDown };
}

