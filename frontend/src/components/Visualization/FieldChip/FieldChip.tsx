import React, { useState, useCallback } from 'react';
import { FieldChipProps } from './types';
import ChipWithTooltip from './ChipWithTooltip';
import FieldContextMenu from './FieldContextMenu';
import { useSelection } from '../../../contexts/SelectionContext';
import { useDragHandlers } from './useDragHandlers';
import { useFieldSelection } from './useFieldSelection';

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
 * - Multi-select with modifier keys (Ctrl/Cmd, Shift)
 */
const FieldChip: React.FC<FieldChipProps> = ({ field, source, onUpdate, index, allFields }) => {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const selection = useSelection();

  // Use custom hooks for cleaner separation of concerns
  const { isDragging, handleDragStart, handleDragEnd } = useDragHandlers({
    field,
    source,
    index,
    allFields,
  });

  const { 
    isSelected, 
    handleMouseDown, 
    handleClick, 
    handleContextMenu: handleContextMenuSelection 
  } = useFieldSelection({
    field,
    source,
    allFields,
  });

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    const position = handleContextMenuSelection(event);
    setMenuPosition(position);
  }, [handleContextMenuSelection]);

  const handleCloseMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  const dragCount = isSelected && selection.selectedFields.length > 1 ? selection.selectedFields.length : undefined;
  
  return (
    <>
      <ChipWithTooltip
        field={field}
        source={source}
        isDragging={isDragging}
        isSelected={isSelected}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragCount={dragCount}
        // Mark invalid only when on axes and the field has been flagged upstream via field.meta
        isInvalidOnAxis={(source === 'X_AXIS' || source === 'Y_AXIS') && (field as any).isInvalid === true}
      />
      
      <FieldContextMenu
        field={field}
        source={source}
        onUpdate={onUpdate}
        menuPosition={menuPosition}
        onCloseMenu={handleCloseMenu}
        selectedFields={selection.selectedFields.filter(sf => sf.source === source).map(sf => sf.field)}
      />
    </>
  );
};

// Note: Not using React.memo here because the component uses context (useSelection)
// which needs to trigger re-renders when selection state changes
export default FieldChip;
