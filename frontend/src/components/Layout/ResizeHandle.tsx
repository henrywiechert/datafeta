// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, Tooltip } from '@mui/material';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  /** Fires once on pointer release with the final (clamped) size. */
  onResize: (newSize: number) => void;
  currentSize?: number;
  minSize?: number;
  maxSize?: number;
  edge?: 'left' | 'right' | 'top' | 'bottom'; // Which edge of the panel this handle is on
}

/**
 * Deferred resize handle: dragging moves a preview line only, and the panel
 * resizes once on release. Styled to match the shell panel handles — thin 1px
 * line, 2px accent on hover.
 */
const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onResize,
  currentSize = 300,
  minSize = 200,
  maxSize = 600,
  edge = 'right', // Default to right edge
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [tempSize, setTempSize] = useState(currentSize);
  const handleRef = useRef<HTMLDivElement>(null);
  const previewLineRef = useRef<HTMLDivElement>(null);
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
    if (previewLine && handleRect) {
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
      onResize(lastResizeRef.current);
      cleanupDragChrome();
    };

    cancelDragRef.current?.();
    cancelDragRef.current = cleanupDragChrome;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [computeSize, currentSize, direction, edge, onResize]);

  useEffect(() => {
    return () => {
      cancelDragRef.current?.();
    };
  }, []);

  const isHorizontal = direction === 'horizontal';
  const displaySize = isDragging ? tempSize : currentSize;

  const tooltipTitle = isDragging
    ? `${Math.round(displaySize)}px (${direction === 'horizontal' ? 'width' : 'height'})`
    : `Drag to resize ${direction === 'horizontal' ? 'width' : 'height'}`;

  // Matches panel resize handles: thin 1px line, 2px blue on hover.
  // While dragging, keep the original line thin; only the preview line moves.
  const handleSx = {
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

  return (
    <>
      {createPortal(
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
          sx={handleSx}
        />
      </Tooltip>
    </>
  );
};

export default ResizeHandle;
