// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useCallback, useRef } from 'react';
import { RESIZE_HANDLE_WIDTH, RESIZE_HANDLE_COLOR, RESIZE_HANDLE_HOVER_COLOR } from '../../../config/chartLayoutConfig';

/** Width of the invisible pointer-capture area around the painted line. */
const HIT_AREA_PX = 10;

interface GridResizeHandleProps {
  orientation: 'horizontal' | 'vertical';
  position: number; // px offset from top (horizontal) or left (vertical)
  length: number; // px length of the handle
  crossAxisOffset?: number; // px offset on the orthogonal axis where the handle starts
  onResizeStart?: () => void;
  onResizeMove?: (delta: number) => void;
  onResizeEnd?: (delta: number) => void;
  zIndex?: number;
  // Which axis area this handle is in (for cursor change)
  isInAxisArea: boolean;
  testId?: string;
}

/**
 * GridResizeHandle - Visual handle for resizing grid cells
 *
 * Positioned on gridlines in the axis areas. A thin painted line (RESIZE_HANDLE_WIDTH)
 * sits inside a wider transparent hit area (HIT_AREA_PX) so it's easy to grab.
 * Uses pointer events with setPointerCapture so the drag survives leaving the window,
 * works with touch/pen, and is cleaned up on pointercancel.
 */
const GridResizeHandle: React.FC<GridResizeHandleProps> = ({
  orientation,
  position,
  length,
  crossAxisOffset = 0,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  zIndex = 10,
  isInAxisArea,
  testId,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const startPositionRef = useRef<number>(0);
  const currentDeltaRef = useRef<number>(0);
  const activePointerIdRef = useRef<number | null>(null);

  const isHorizontal = orientation === 'horizontal';

  const cleanupGlobalDragStyles = useCallback(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const finishDrag = useCallback((commit: boolean) => {
    const delta = currentDeltaRef.current;
    setIsDragging(false);
    activePointerIdRef.current = null;
    cleanupGlobalDragStyles();
    if (commit && onResizeEnd) {
      onResizeEnd(delta);
    }
  }, [cleanupGlobalDragStyles, onResizeEnd]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isInAxisArea) return;
    // Only react to primary button (left mouse, touch, pen tip)
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    e.preventDefault();
    e.stopPropagation();

    activePointerIdRef.current = e.pointerId;
    startPositionRef.current = isHorizontal ? e.clientY : e.clientX;
    currentDeltaRef.current = 0;
    setIsDragging(true);

    // Capture the pointer so we keep getting move events even outside the element.
    // setPointerCapture may be missing in test environments (jsdom).
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (onResizeStart) onResizeStart();

    document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, [isHorizontal, isInAxisArea, onResizeStart]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    const currentPos = isHorizontal ? e.clientY : e.clientX;
    const delta = currentPos - startPositionRef.current;
    currentDeltaRef.current = delta;
    if (onResizeMove) onResizeMove(delta);
  }, [isHorizontal, onResizeMove]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    finishDrag(true);
  }, [finishDrag]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    // Cancelled (e.g. system gesture, lost capture) — don't commit the resize
    finishDrag(false);
  }, [finishDrag]);

  // Only show visual handle in axis areas when hovered or dragging
  const showVisual = (isHovered || isDragging) && isInAxisArea;

  // Position the hit area so the painted line is centered inside it.
  const lineOffset = (HIT_AREA_PX - RESIZE_HANDLE_WIDTH) / 2;

  return (
    <div
      data-testid={testId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        ...(isHorizontal
          ? {
              top: `${position}px`,
              left: `${crossAxisOffset}px`,
              width: `${length}px`,
              height: `${HIT_AREA_PX}px`,
              transform: `translateY(-${HIT_AREA_PX / 2}px)`, // Center on gridline
              cursor: isInAxisArea ? 'row-resize' : 'default',
            }
          : {
              left: `${position}px`,
              top: `${crossAxisOffset}px`,
              height: `${length}px`,
              width: `${HIT_AREA_PX}px`,
              transform: `translateX(-${HIT_AREA_PX / 2}px)`, // Center on gridline
              cursor: isInAxisArea ? 'col-resize' : 'default',
            }),
        zIndex,
        pointerEvents: isInAxisArea ? 'auto' : 'none', // Only interactive in axis area
        touchAction: 'none', // Prevent browser gestures from hijacking the drag
        background: 'transparent',
      }}
    >
      {/* The thin painted line, centered inside the wider hit area */}
      <div
        style={{
          position: 'absolute',
          ...(isHorizontal
            ? {
                left: 0,
                top: `${lineOffset}px`,
                width: '100%',
                height: `${RESIZE_HANDLE_WIDTH}px`,
              }
            : {
                top: 0,
                left: `${lineOffset}px`,
                height: '100%',
                width: `${RESIZE_HANDLE_WIDTH}px`,
              }),
          backgroundColor: showVisual
            ? isDragging
              ? RESIZE_HANDLE_HOVER_COLOR
              : RESIZE_HANDLE_COLOR
            : 'transparent',
          transition: isDragging ? 'none' : 'background-color 0.15s ease',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

export default GridResizeHandle;

