import React, { useState, useCallback, useRef, useEffect } from 'react';
import { RESIZE_HANDLE_WIDTH, RESIZE_HANDLE_COLOR, RESIZE_HANDLE_HOVER_COLOR } from '../../../config/chartLayoutConfig';

interface GridResizeHandleProps {
  orientation: 'horizontal' | 'vertical';
  position: number; // px offset from top (horizontal) or left (vertical)
  length: number; // px length of the handle
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

  const isHorizontal = orientation === 'horizontal';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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

  // Mouse move and up handlers attached to document for better drag experience
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = isHorizontal ? e.clientY : e.clientX;
      const delta = currentPos - startPositionRef.current;
      currentDeltaRef.current = delta;
      
      if (onResizeMove) {
        onResizeMove(delta);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      
      if (onResizeEnd) {
        onResizeEnd(currentDeltaRef.current);
      }
      
      // Reset cursor
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isHorizontal, onResizeMove, onResizeEnd]);

  // Only show visual handle in axis areas when hovered or dragging
  const showVisual = (isHovered || isDragging) && isInAxisArea;

  return (
    <div
      data-testid={testId}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        ...(isHorizontal
          ? {
              top: `${position}px`,
              left: 0,
              width: `${length}px`,
              height: `${RESIZE_HANDLE_WIDTH}px`,
              transform: 'translateY(-50%)', // Center on gridline
              cursor: isInAxisArea ? 'row-resize' : 'default',
            }
          : {
              left: `${position}px`,
              top: 0,
              height: `${length}px`,
              width: `${RESIZE_HANDLE_WIDTH}px`,
              transform: 'translateX(-50%)', // Center on gridline
              cursor: isInAxisArea ? 'col-resize' : 'default',
            }),
        zIndex,
        pointerEvents: isInAxisArea ? 'auto' : 'none', // Only interactive in axis area
        // Visual indicator (only shown on hover/drag in axis areas)
        backgroundColor: showVisual
          ? isDragging
            ? RESIZE_HANDLE_HOVER_COLOR
            : RESIZE_HANDLE_COLOR
          : 'transparent',
        transition: isDragging ? 'none' : 'background-color 0.15s ease',
      }}
    />
  );
};

export default GridResizeHandle;

