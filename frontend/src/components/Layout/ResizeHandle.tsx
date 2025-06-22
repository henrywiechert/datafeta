import React, { useState, useRef, useCallback } from 'react';
import { Box, Tooltip } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (newSize: number) => void;
  currentSize?: number;
  minSize?: number;
  maxSize?: number;
  edge?: 'left' | 'right' | 'top' | 'bottom'; // Which edge of the panel this handle is on
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ 
  direction, 
  onResize, 
  currentSize = 300,
  minSize = 200, 
  maxSize = 600,
  edge = 'right' // Default to right edge
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [startPos, setStartPos] = useState(0);
  const [tempSize, setTempSize] = useState(currentSize);
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const initialPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const initialSize = currentSize;
    setTempSize(initialSize);
    
    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const totalDelta = currentPos - initialPos;
      
      // Calculate new size based on direction and edge
      let newSize: number;
      if (direction === 'horizontal') {
        if (edge === 'left') {
          // Left edge: dragging right makes panel smaller, left makes it bigger
          newSize = initialSize - totalDelta;
        } else {
          // Right edge: dragging right makes panel bigger, left makes it smaller
          newSize = initialSize + totalDelta;
        }
      } else {
        if (edge === 'top') {
          // Top edge: dragging down makes panel smaller, up makes it bigger
          newSize = initialSize - totalDelta;
        } else {
          // Bottom edge: dragging down makes panel bigger, up makes it smaller
          newSize = initialSize + totalDelta;
        }
      }
      
      // Apply constraints
      newSize = Math.max(minSize, Math.min(maxSize, newSize));
      
      // Update display size
      setTempSize(newSize);
      
      // Update actual size
      onResize(newSize);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction, onResize, currentSize, minSize, maxSize, edge]);

  const isHorizontal = direction === 'horizontal';
  const showIndicator = isHovered || isDragging;
  const displaySize = isDragging ? tempSize : currentSize;

  const tooltipTitle = isDragging 
    ? `${Math.round(displaySize)}px (${direction === 'horizontal' ? 'width' : 'height'})`
    : `Drag to resize ${direction === 'horizontal' ? 'width' : 'height'}`;

  return (
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
        sx={{
          position: 'relative',
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
        }}
      >
        {/* Drag indicator that appears on hover */}
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
  );
};

export default ResizeHandle; 