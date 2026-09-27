// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { RESIZE_HANDLE_WIDTH, RESIZE_HANDLE_COLOR, RESIZE_HANDLE_HOVER_COLOR } from '../../../config/chartLayoutConfig';
import { useTabletUi } from '../../../hooks/useTabletUi';

const TABLET_RESIZE_HIT_PX = 24;

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
 * Positioned on gridlines in the axis areas. Shows hover state and
 * provides drag functionality for resizing.
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
  const { isTablet } = useTabletUi();

  const isHorizontal = orientation === 'horizontal';
  // Tablet: wide invisible hit area around the thin visual line.
  const hitThickness = isTablet ? TABLET_RESIZE_HIT_PX : RESIZE_HANDLE_WIDTH;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    startPositionRef.current = isHorizontal ? e.clientY : e.clientX;
    currentDeltaRef.current = 0;
    
    if (onResizeStart) {
      onResizeStart();
    }

    // Set cursor on body for better UX during drag
    document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, [isHorizontal, onResizeStart]);

  // Pointer move and up handlers attached to document for better drag experience.
  // Pointer events (not mouse) so finger and pen drags work too.
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const currentPos = isHorizontal ? e.clientY : e.clientX;
      const delta = currentPos - startPositionRef.current;
      currentDeltaRef.current = delta;
      
      if (onResizeMove) {
        onResizeMove(delta);
      }
    };

    const finish = (delta: number) => {
      setIsDragging(false);
      
      if (onResizeEnd) {
        onResizeEnd(delta);
      }
      
      // Reset cursor
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const handlePointerUp = () => finish(currentDeltaRef.current);
    // A cancelled gesture abandons the resize.
    const handlePointerCancel = () => finish(0);

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [isDragging, isHorizontal, onResizeMove, onResizeEnd]);

  // Only show visual handle in axis areas when hovered or dragging.
  // Tablet has no hover, so the line rests faintly visible instead.
  const showVisual = (isHovered || isDragging) && isInAxisArea;
  const showResting = isTablet && isInAxisArea && !showVisual;

  return (
    <div
      data-testid={testId}
      onPointerDown={handlePointerDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        ...(isHorizontal
          ? {
              top: `${position}px`,
              left: `${crossAxisOffset}px`,
              width: `${length}px`,
              height: `${hitThickness}px`,
              transform: 'translateY(-50%)', // Center on gridline
              cursor: isInAxisArea ? 'row-resize' : 'default',
            }
          : {
              left: `${position}px`,
              top: `${crossAxisOffset}px`,
              height: `${length}px`,
              width: `${hitThickness}px`,
              transform: 'translateX(-50%)', // Center on gridline
              cursor: isInAxisArea ? 'col-resize' : 'default',
            }),
        zIndex,
        pointerEvents: isInAxisArea ? 'auto' : 'none', // Only interactive in axis area
        // The handles sit over scrolling axis strips; keep the browser from
        // claiming a finger drag as a scroll.
        touchAction: 'none',
      }}
    >
      {/* Visual indicator (only shown on hover/drag in axis areas) */}
      <div
        style={{
          position: 'absolute',
          ...(isHorizontal
            ? { left: 0, right: 0, top: '50%', height: `${RESIZE_HANDLE_WIDTH}px`, transform: 'translateY(-50%)' }
            : { top: 0, bottom: 0, left: '50%', width: `${RESIZE_HANDLE_WIDTH}px`, transform: 'translateX(-50%)' }),
          pointerEvents: 'none',
          backgroundColor: showVisual
            ? isDragging
              ? RESIZE_HANDLE_HOVER_COLOR
              : RESIZE_HANDLE_COLOR
            : showResting
              ? RESIZE_HANDLE_COLOR
              : 'transparent',
          opacity: showResting ? 0.5 : 1,
          transition: isDragging ? 'none' : 'background-color 0.15s ease',
        }}
      />
    </div>
  );
};

export default GridResizeHandle;

