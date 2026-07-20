// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, Tooltip } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (newSize: number) => void;
  currentSize?: number;
  minSize?: number;
  maxSize?: number;
  edge?: 'left' | 'right' | 'top' | 'bottom'; // Which edge of the panel this handle is on
  /** When true, drag only moves a preview line; onResize fires on release. */
  deferred?: boolean;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ 
  direction, 
  onResize, 
  currentSize = 300,
  minSize = 200, 
  maxSize = 600,
  edge = 'right', // Default to right edge
  deferred = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [tempSize, setTempSize] = useState(currentSize);
  const handleRef = useRef<HTMLDivElement>(null);
  const previewLineRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastResizeRef = useRef<number>(currentSize);
  const cancelDragRef = useRef<(() => void) | null>(null);

  const computeSize = useCallback((initialSize: number, totalDelta: number) => {
    let newSize: number;
    if (direction === 'horizontal') {
      newSize = edge === 'left' ? initialSize - totalDelta : initialSize + totalDelta;
    } else {
      newSize = edge === 'top' ? initialSize - totalDelta : initialSize + totalDelta;
    }
    return Math.max(minSize, Math.min(maxSize, newSize));
  }, [direction, edge, minSize, maxSize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const initialPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const initialSize = currentSize;
    setTempSize(initialSize);
    lastResizeRef.current = initialSize;

    const previewLine = previewLineRef.current;
    const handleRect = handleRef.current?.getBoundingClientRect();
    if (deferred && previewLine && handleRect) {
      // Fixed positioning so the preview isn't clipped by overflow:hidden parents.
      if (direction === 'horizontal') {
        previewLine.style.top = `${handleRect.top}px`;
        previewLine.style.height = `${handleRect.height}px`;
        previewLine.style.left = `${handleRect.left + handleRect.width / 2 - 1}px`;
        previewLine.style.width = '2px';
      } else {
        previewLine.style.left = `${handleRect.left}px`;
        previewLine.style.width = `${handleRect.width}px`;
        previewLine.style.top = `${handleRect.top + handleRect.height / 2 - 1}px`;
        previewLine.style.height = '2px';
      }
      previewLine.style.display = 'block';
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      const totalDelta = currentPos - initialPos;
      const newSize = computeSize(initialSize, totalDelta);
      setTempSize(newSize);

      if (deferred) {
        // Preview line follows the clamped drag; panel size commits on release.
        const lineOffset = (edge === 'left' || edge === 'top')
          ? initialSize - newSize
          : newSize - initialSize;
        if (previewLine) {
          previewLine.style.transform = direction === 'horizontal'
            ? `translateX(${lineOffset}px)`
            : `translateY(${lineOffset}px)`;
        }
        lastResizeRef.current = newSize;
        return;
      }

      // Live resize: throttle panel updates with rAF
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          onResize(newSize);
          lastResizeRef.current = newSize;
          rafIdRef.current = null;
        });
      }
    };

    const cleanupDragChrome = () => {
      if (previewLine) {
        previewLine.style.display = 'none';
        previewLine.style.transform = '';
        previewLine.style.top = '';
        previewLine.style.left = '';
        previewLine.style.width = '';
        previewLine.style.height = '';
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cancelDragRef.current = null;
    };

    const handleMouseUp = () => {
      setIsDragging(false);

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      onResize(lastResizeRef.current);
      cleanupDragChrome();
    };

    cancelDragRef.current?.();
    cancelDragRef.current = cleanupDragChrome;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [computeSize, currentSize, deferred, direction, edge, onResize]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      cancelDragRef.current?.();
    };
  }, []);

  const isHorizontal = direction === 'horizontal';
  const showIndicator = !deferred && (isHovered || isDragging);
  const displaySize = isDragging ? tempSize : currentSize;

  const tooltipTitle = isDragging 
    ? `${Math.round(displaySize)}px (${direction === 'horizontal' ? 'width' : 'height'})`
    : `Drag to resize ${direction === 'horizontal' ? 'width' : 'height'}`;

  // Deferred mode matches panel resize handles: thin 1px line, 2px blue on hover.
  // While dragging, keep the original line thin; only the preview line moves.
  const deferredSx = {
    position: 'relative' as const,
    cursor: isHorizontal ? 'col-resize' : 'row-resize',
    backgroundColor: 'transparent',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.15s',
    ...(isHorizontal ? { width: 6, height: '100%', flex: '0 0 6px' } : { height: 6, width: '100%', flex: '0 0 6px' }),
    ...(isDragging ? {} : {
      '&:hover': {
        backgroundColor: 'action.hover',
      },
      '&:hover::after': {
        backgroundColor: 'primary.main',
        ...(isHorizontal ? { width: '2px' } : { height: '2px' }),
      },
    }),
    '&::after': {
      content: '""',
      position: 'absolute',
      backgroundColor: '#e0e0e0',
      transition: isDragging ? 'none' : 'background-color 0.15s, width 0.15s, height 0.15s',
      ...(isHorizontal ? {
        top: 0,
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '1px',
      } : {
        left: 0,
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        height: '1px',
      }),
    },
  };

  const liveSx = {
    position: 'relative' as const,
    cursor: isHorizontal ? 'col-resize' : 'row-resize',
    backgroundColor: isDragging ? 'primary.main' : (isHovered ? 'primary.light' : 'divider'),
    transition: isDragging ? 'none' : 'all 0.2s ease-in-out',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isHorizontal ? {
      width: isDragging || isHovered ? '6px' : '2px',
      height: '100%',
      '&::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: '-4px',
        right: '-4px',
        bottom: 0,
        backgroundColor: 'transparent',
      }
    } : {
      height: isDragging || isHovered ? '6px' : '2px',
      width: '100%',
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        right: 0,
        top: '-4px',
        bottom: '-4px',
        backgroundColor: 'transparent',
      }
    })
  };

  return (
    <>
      {deferred && createPortal(
        <Box
          ref={previewLineRef}
          sx={{
            display: 'none',
            position: 'fixed',
            backgroundColor: 'primary.main',
            pointerEvents: 'none',
            zIndex: 1400,
          }}
        />,
        document.body,
      )}
      <Tooltip 
        title={tooltipTitle}
        open={isDragging || isHovered}
        placement={isHorizontal ? 'top' : 'left'}
        arrow
      >
        <Box
          ref={handleRef}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          sx={deferred ? deferredSx : liveSx}
        >
          {/* Drag indicator that appears on hover (live resize only) */}
          {showIndicator && (
            <Box
              sx={{
                position: 'absolute',
                color: isDragging ? 'white' : 'primary.main',
                opacity: 0.8,
                transform: isHorizontal ? 'rotate(90deg)' : 'none',
                fontSize: '12px',
                transition: 'all 0.2s ease-in-out',
              }}
            >
              <DragIndicatorIcon sx={{ fontSize: '16px' }} />
            </Box>
          )}
        </Box>
      </Tooltip>
    </>
  );
};

export default ResizeHandle;
