import React, { useCallback, useState } from 'react';
import { FieldChipProps } from './types';
import ChipWithTooltip from './ChipWithTooltip';
import FieldContextMenu from './FieldContextMenu';

/**
 * FieldChip Component
 * 
 * This component displays a field as a draggable chip that can appear in either:
 * 1. The Fields area (left panel) - source: AVAILABLE_FIELDS
 * 2. The Axes drop zones - source: X_AXIS or Y_AXIS
 * 
 * Features:
 * - Draggable for drag and drop operations
 * - Context menu for changing field properties
 * - Tooltips that only show when text is truncated
 * - Visual styling based on field properties (continuous/discrete)
 * - Automatic truncation detection with ResizeObserver
 */
const FieldChip: React.FC<FieldChipProps> = ({ field, source, onUpdate, index }) => {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify({
      field,
      source,
      index
    }));
    e.dataTransfer.effectAllowed = 'move';
  }, [field, source, index]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    // Get the element's position
    const rect = event.currentTarget.getBoundingClientRect();
    
    // Position menu relative to the element, not the exact click point
    const x = rect.left;
    const y = rect.bottom + 5; // 5px below the element
    
    setMenuPosition({ x, y });
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  return (
    <>
      <ChipWithTooltip
        field={field}
        source={source}
        isDragging={isDragging}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
      
      <FieldContextMenu
        field={field}
        source={source}
        onUpdate={onUpdate}
        menuPosition={menuPosition}
        onCloseMenu={handleCloseMenu}
      />
    </>
  );
};

export default FieldChip;
