// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { T } from '../../../theme/tokens';
import { devLog } from '../../../utils/devLog';
import { setMeasuringActive } from './utils/ganttMeasure';

const LOCK_THRESHOLD_PX = 5;

/** 'zoom' creates/updates a filter (existing behavior); 'measure' is reserved for span measurement. */
export type BrushGesture = 'zoom' | 'measure';

export interface BrushResult {
  axis: 'x' | 'y';
  /** min(origin, current) along the locked axis — use for a simple range (e.g. zoom). */
  startPx: number;
  /** max(origin, current) along the locked axis. */
  endPx: number;
  gesture: BrushGesture;
  /** Literal (not min/max'd) position along the locked axis where the drag began. */
  originAxisPx: number;
  /** Literal (not min/max'd) position along the locked axis right now. */
  currentAxisPx: number;
  /** Position along the OTHER axis at drag origin — lets consumers know which "row" the drag started in. */
  originCrossAxisPx: number;
  /** Position along the OTHER axis right now — the row currently under the pointer. */
  currentCrossAxisPx: number;
}

interface BrushOverlayProps {
  disabled?: boolean;
  onBrushEnd: (result: BrushResult) => void;
  /** Fired continuously while a locked drag is in progress (not just at the end), so callers can live-preview the result (e.g. snapped measurement). */
  onBrushMove?: (result: BrushResult) => void;
  /** Allow Alt/Option+drag to resolve as the 'measure' gesture (default false: ignored, same as no modifier). */
  measureEnabled?: boolean;
  /**
   * Axis a 'measure' drag always locks to, whatever direction it starts in
   * (the Gantt timeline axis; measuring across categories means nothing).
   * Unset: measure locks like zoom, to the dominant drag direction.
   */
  measureAxis?: 'x' | 'y';
  /** Fired when a new drag begins (any gesture), before it's known to complete — lets callers clear stale state from a previous gesture. */
  onDragStart?: () => void;
  children: React.ReactNode;
}

interface BrushState {
  active: boolean;
  locked: 'x' | 'y' | null;
  gesture: BrushGesture | null;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

const initialBrushState: BrushState = {
  active: false,
  locked: null,
  gesture: null,
  originX: 0,
  originY: 0,
  currentX: 0,
  currentY: 0,
};

/**
 * Resolve which drag gesture a pointerdown represents: Ctrl (Win/Linux) or Cmd
 * (Mac) for zoom-brush (existing behavior), Alt/Option for span measurement
 * (only when `measureEnabled`). Returns null when neither applies (no drag
 * should start).
 */
function resolveGestureKind(e: PointerEvent | React.PointerEvent, measureEnabled: boolean): BrushGesture | null {
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  const zoomModifierHeld = isMac ? e.metaKey : e.ctrlKey;
  if (zoomModifierHeld) return 'zoom';
  if (measureEnabled && e.altKey) return 'measure';
  return null;
}

/**
 * Wraps chart content and captures modifier+drag to produce a 1D brush selection.
 *
 * Requires Ctrl (Win/Linux) or Cmd (Mac) to be held when starting the drag.
 * Uses document-level listeners for move/up to guarantee reliable event capture
 * regardless of which child element the pointer is over, and claims the
 * pointerdown in the capture phase so chart content cannot swallow it.
 */
const BrushOverlay: React.FC<BrushOverlayProps> = ({ disabled, onBrushEnd, onBrushMove, measureEnabled = false, measureAxis, onDragStart, children }) => {
  const [brush, setBrush] = useState<BrushState>(initialBrushState);
  const brushRef = useRef<BrushState>(initialBrushState);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onBrushEndRef = useRef(onBrushEnd);
  onBrushEndRef.current = onBrushEnd;
  const onBrushMoveRef = useRef(onBrushMove);
  onBrushMoveRef.current = onBrushMove;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const measureAxisRef = useRef(measureAxis);
  measureAxisRef.current = measureAxis;

  const getLocalCoords = useCallback((e: PointerEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  useEffect(() => {
    const b = brushRef.current;
    if (!b.active) return;

    const handleMove = (e: PointerEvent) => {
      const coords = getLocalCoords(e);
      if (!coords) return;

      let locked = brushRef.current.locked;
      if (!locked) {
        const dx = Math.abs(coords.x - brushRef.current.originX);
        const dy = Math.abs(coords.y - brushRef.current.originY);
        if (dx >= LOCK_THRESHOLD_PX || dy >= LOCK_THRESHOLD_PX) {
          locked = brushRef.current.gesture === 'measure' && measureAxisRef.current
            ? measureAxisRef.current
            : (dx >= dy ? 'x' : 'y');
        }
      }

      const next: BrushState = { ...brushRef.current, locked, currentX: coords.x, currentY: coords.y };
      brushRef.current = next;
      setBrush(next);

      if (locked && next.gesture) {
        const originAxisPx = locked === 'x' ? next.originX : next.originY;
        const currentAxisPx = locked === 'x' ? coords.x : coords.y;
        const originCrossAxisPx = locked === 'x' ? next.originY : next.originX;
        const currentCrossAxisPx = locked === 'x' ? coords.y : coords.x;
        onBrushMoveRef.current?.({
          axis: locked,
          startPx: Math.min(originAxisPx, currentAxisPx),
          endPx: Math.max(originAxisPx, currentAxisPx),
          gesture: next.gesture,
          originAxisPx,
          currentAxisPx,
          originCrossAxisPx,
          currentCrossAxisPx,
        });
      }
    };

    const handleUp = (e: PointerEvent) => {
      const b = brushRef.current;
      devLog('[BrushOverlay] pointerup', { active: b.active, locked: b.locked, gesture: b.gesture });

      if (b.locked && b.gesture) {
        const coords = getLocalCoords(e);
        const cur = coords ?? { x: b.currentX, y: b.currentY };
        const start = b.locked === 'x' ? b.originX : b.originY;
        const end = b.locked === 'x' ? cur.x : cur.y;
        devLog('[BrushOverlay] brush end', { axis: b.locked, gesture: b.gesture, start, end, dist: Math.abs(end - start) });
        if (Math.abs(end - start) >= LOCK_THRESHOLD_PX) {
          const originCrossAxisPx = b.locked === 'x' ? b.originY : b.originX;
          const currentCrossAxisPx = b.locked === 'x' ? cur.y : cur.x;
          onBrushEndRef.current({
            axis: b.locked,
            startPx: Math.min(start, end),
            endPx: Math.max(start, end),
            gesture: b.gesture,
            originAxisPx: start,
            currentAxisPx: end,
            originCrossAxisPx,
            currentCrossAxisPx,
          });
        }
      }

      if (b.gesture === 'measure') setMeasuringActive(false);
      brushRef.current = initialBrushState;
      setBrush(initialBrushState);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      // Unmounted mid-drag: don't leave hover suppressed page-wide.
      if (brushRef.current.gesture === 'measure') setMeasuringActive(false);
    };
  }, [brush.active, getLocalCoords]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    const gesture = resolveGestureKind(e, measureEnabled);
    if (!gesture) return;

    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // A brush drag belongs to the brush alone. Plot's pointer interaction
    // (crosshair overlay) toggles its sticky state on pointerdown and calls
    // stopImmediatePropagation, which would otherwise swallow this event
    // before it bubbled back up here — so it is handled in the capture phase
    // and kept from reaching the plot.
    e.stopPropagation();

    onDragStartRef.current?.();
    if (gesture === 'measure') setMeasuringActive(true);

    const next: BrushState = {
      active: true,
      locked: null,
      gesture,
      originX: x,
      originY: y,
      currentX: x,
      currentY: y,
    };
    brushRef.current = next;
    setBrush(next);
  }, [disabled, measureEnabled]);

  // Build the visual highlight band (pointer-events: none so it doesn't block tooltips).
  // 'measure' has no band of its own here: the snapped measurement overlay
  // (driven by onBrushMove/onBrushEnd) is the only visual for that gesture,
  // so dragging shows the real snapped result instead of the raw drag extent.
  let bandStyle: React.CSSProperties | undefined;
  if (brush.active && brush.locked && brush.gesture === 'zoom') {
    const minX = Math.min(brush.originX, brush.currentX);
    const maxX = Math.max(brush.originX, brush.currentX);
    const minY = Math.min(brush.originY, brush.currentY);
    const maxY = Math.max(brush.originY, brush.currentY);

    if (brush.locked === 'x') {
      bandStyle = {
        position: 'absolute',
        left: minX,
        top: 0,
        width: maxX - minX,
        height: '100%',
        backgroundColor: T.chartBrushFill,
        borderLeft: `1px solid ${T.chartBrushEdge}`,
        borderRight: `1px solid ${T.chartBrushEdge}`,
        pointerEvents: 'none',
        zIndex: 3,
      };
    } else {
      bandStyle = {
        position: 'absolute',
        left: 0,
        top: minY,
        width: '100%',
        height: maxY - minY,
        backgroundColor: T.chartBrushFill,
        borderTop: `1px solid ${T.chartBrushEdge}`,
        borderBottom: `1px solid ${T.chartBrushEdge}`,
        pointerEvents: 'none',
        zIndex: 3,
      };
    }
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        cursor: brush.active && brush.locked ? 'crosshair' : undefined,
      }}
      onPointerDownCapture={handlePointerDown}
    >
      {/* Marks still get native hover/mouseenter while a button is held down
          and moving — this blocks those events from reaching them during an
          active drag so tooltips don't pop up and compete with the brush/
          measurement visuals. Document-level drag tracking (handleMove/handleUp
          above) is unaffected since it doesn't depend on hit-testing this subtree. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', pointerEvents: brush.active ? 'none' : undefined }}>
        {children}
      </div>
      {bandStyle && <div style={bandStyle} />}
    </div>
  );
};

export default React.memo(BrushOverlay);
