import React, { useState, useCallback, useMemo } from 'react';
import { FieldChipProps } from './types';
import ChipWithTooltip from './ChipWithTooltip';
import FieldContextMenu from './FieldContextMenu';
import { useSelectionStore } from '../../../stores/selectionStore';
import { useIsFieldSelected } from '../../../stores/useFieldSelected';
import { useDragHandlers } from './useDragHandlers';
import { useFieldSelection } from './useFieldSelection';
import { FieldMenuConfig, getDefaultFieldMenuConfig } from './fieldMenuConfig';

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
 * 
 * Performance:
 * - Uses Zustand selectors for granular re-renders
 * - Only re-renders when THIS field's selection status changes
 */
const FieldChip: React.FC<
  FieldChipProps & {
    menuConfig?: FieldMenuConfig;
    onRemoveFromZone?: (fieldIds: string[]) => void;
    displayNameOverride?: string;
  }
> = ({ field, source, onUpdate, index, allFields, menuConfig, onRemoveFromZone, displayNameOverride }) => {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Granular subscription - only re-renders when THIS field's selection changes
  const isSelected = useIsFieldSelected(field.id, source);
  
  // Get stable action references (never cause re-renders)
  const getSelectedFieldsForSource = useSelectionStore((s: any) => s.getSelectedFieldsForSource);
  const getSelectedCount = useSelectionStore((s: any) => s.getSelectedCount);

  // Use custom hooks for cleaner separation of concerns
  const { isDragging, handleDragStart, handleDragEnd } = useDragHandlers({
    field,
    source,
    index,
    allFields,
  });

  const { 
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

  // dragCount computed on demand - only affects this chip when dragging
  const dragCount = isDragging && isSelected ? getSelectedCount() : undefined;
  
  // selectedFields for context menu - only fetched when menu opens
  const selectedFieldsForMenu = menuPosition 
    ? getSelectedFieldsForSource(source).map((sf: any) => sf.field) 
    : [];

  const effectiveMenuConfig = useMemo(
    () => menuConfig ?? getDefaultFieldMenuConfig(source),
    [menuConfig, source]
  );
  
  return (
    <>
      <ChipWithTooltip
        field={field}
        source={source}
        isDragging={isDragging}
        isSelected={isSelected}
        displayNameOverride={displayNameOverride}
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
        menuConfig={effectiveMenuConfig}
        onRemoveFromZone={onRemoveFromZone}
      />
    </>
  );
};

// Note: Not using React.memo here because the component now uses Zustand selectors
// which provide granular subscriptions. The component only re-renders when
// the selected isSelected value changes for THIS specific field.
export default FieldChip;
