import React, { useState, useCallback, useMemo } from 'react';
import { FieldChipProps } from './types';
import ChipWithTooltip from './ChipWithTooltip';
import FieldContextMenu from './FieldContextMenu';
import { useSelectionCallbacks } from '../../../contexts/SelectionContext';
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
  // Only use stable callbacks context - won't cause re-renders when selection changes
  const { getSelectedCount, getSelectedFieldsForSource } = useSelectionCallbacks();

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

  // Use stable callback to get drag count - only compute when menu is open or dragging
  const dragCount = isSelected && getSelectedCount() > 1 ? getSelectedCount() : undefined;
  
  // Memoize selected fields for context menu - only computed when menu is open
  const selectedFieldsForMenu = useMemo(() => {
    if (!menuPosition) return []; // Don't compute if menu is closed
    return getSelectedFieldsForSource(source).map(sf => sf.field);
  }, [menuPosition, source, getSelectedFieldsForSource]);
  
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
        selectedFields={selectedFieldsForMenu}
      />
    </>
  );
};

// Custom memo comparison to prevent re-renders when only allFields array reference changes
// We only need to re-render if our specific field or callbacks changed
export default React.memo(FieldChip, (prevProps, nextProps) => {
  // Check if field object is the same reference or has same content
  if (prevProps.field !== nextProps.field) {
    // Deep compare the field properties that affect rendering
    const prevField = prevProps.field;
    const nextField = nextProps.field;
    if (
      prevField.id !== nextField.id ||
      prevField.columnName !== nextField.columnName ||
      prevField.type !== nextField.type ||
      prevField.flavour !== nextField.flavour ||
      prevField.aggregation !== nextField.aggregation ||
      prevField.dataType !== nextField.dataType ||
      (prevField as any).isInvalid !== (nextField as any).isInvalid ||
      (prevField as any).is_virtual !== (nextField as any).is_virtual
    ) {
      return false; // Props changed, should re-render
    }
  }
  
  // Other props that matter
  if (prevProps.source !== nextProps.source) return false;
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.onUpdate !== nextProps.onUpdate) return false;
  
  // allFields changes should NOT trigger re-render - we use it via ref in hooks
  // So we intentionally skip comparing allFields
  
  return true; // Props are equal, skip re-render
});
