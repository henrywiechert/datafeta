import React, { useCallback, useRef, useState, useEffect } from 'react';

const LOCK_THRESHOLD_PX = 5;

export interface BrushResult {
  axis: 'x' | 'y';
  startPx: number;
  endPx: number;
}

interface BrushOverlayProps {
  disabled?: boolean;
  onBrushEnd: (result: BrushResult) => void;
  children: React.ReactNode;
}

interface BrushState {
  active: boolean;
  locked: 'x' | 'y' | null;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

const initialBrushState: BrushState = {
  active: false,
  locked: null,
  originX: 0,
  originY: 0,
  currentX: 0,
  currentY: 0,
};

/** Ctrl on Windows/Linux, Meta (Cmd) on Mac */
function isModifierHeld(e: PointerEvent | React.PointerEvent): boolean {
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  return isMac ? e.metaKey : e.ctrlKey;
}

/**
 * Wraps chart content and captures modifier+drag to produce a 1D brush selection.
 *
 * Requires Ctrl (Win/Linux) or Cmd (Mac) to be held when starting the drag.
 * Uses document-level listeners for move/up to guarantee reliable event capture
 * regardless of which child element the pointer is over.
 */
const BrushOverlay: React.FC<BrushOverlayProps> = ({ disabled, onBrushEnd, children }) => {
  const [brush, setBrush] = useState<BrushState>(initialBrushState);
  const brushRef = useRef<BrushState>(initialBrushState);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onBrushEndRef = useRef(onBrushEnd);
  onBrushEndRef.current = onBrushEnd;

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
          locked = dx >= dy ? 'x' : 'y';
        }
      }

      const next: BrushState = { ...brushRef.current, locked, currentX: coords.x, currentY: coords.y };
      brushRef.current = next;
      setBrush(next);
    };

    const handleUp = (e: PointerEvent) => {
      const b = brushRef.current;
      console.debug('[BrushOverlay] pointerup', { active: b.active, locked: b.locked });

      if (b.locked) {
        const coords = getLocalCoords(e);
        const cur = coords ?? { x: b.currentX, y: b.currentY };
        const start = b.locked === 'x' ? b.originX : b.originY;
        const end = b.locked === 'x' ? cur.x : cur.y;
        console.debug('[BrushOverlay] brush end', { axis: b.locked, start, end, dist: Math.abs(end - start) });
        if (Math.abs(end - start) >= LOCK_THRESHOLD_PX) {
          onBrushEndRef.current({
            axis: b.locked,
            startPx: Math.min(start, end),
            endPx: Math.max(start, end),
          });
        }
      }

      brushRef.current = initialBrushState;
      setBrush(initialBrushState);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [brush.active, getLocalCoords]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || e.button !== 0 || !isModifierHeld(e)) return;

    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const next: BrushState = {
      active: true,
      locked: null,
      originX: x,
      originY: y,
      currentX: x,
      currentY: y,
    };
    brushRef.current = next;
    setBrush(next);
  }, [disabled]);

  // Build the visual highlight band (pointer-events: none so it doesn't block tooltips)
  let bandStyle: React.CSSProperties | undefined;
  if (brush.active && brush.locked) {
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
        backgroundColor: 'rgba(70, 130, 180, 0.15)',
        borderLeft: '1px solid rgba(70, 130, 180, 0.5)',
        borderRight: '1px solid rgba(70, 130, 180, 0.5)',
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
        backgroundColor: 'rgba(70, 130, 180, 0.15)',
        borderTop: '1px solid rgba(70, 130, 180, 0.5)',
        borderBottom: '1px solid rgba(70, 130, 180, 0.5)',
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
      onPointerDown={handlePointerDown}
    >
      {children}
      {bandStyle && <div style={bandStyle} />}
    </div>
  );
};

export default React.memo(BrushOverlay);
