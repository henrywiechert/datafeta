import React, { useCallback, useState } from 'react';
import { Field } from '../../../types';
import { FieldChipProps } from './types';
import ChipWithTooltip from './ChipWithTooltip';
import FieldContextMenu from './FieldContextMenu';
import { useSelection } from '../../../contexts/SelectionContext';

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
  const [isDragging, setIsDragging] = useState(false);
  const selection = useSelection();
  
  // Use refs to avoid recreating callbacks when field/source/index change
  const fieldRef = React.useRef(field);
  const sourceRef = React.useRef(source);
  const indexRef = React.useRef(index);
  
  // Update refs when props change
  React.useEffect(() => {
    fieldRef.current = field;
    sourceRef.current = source;
    indexRef.current = index;
  }, [field, source, index]);

  const isSelected = selection.isSelected(field.id, source);

  // Use ref to always have fresh selection state in memoized callbacks
  const selectionRef = React.useRef(selection);
  React.useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Handle selection on mouseDown for immediate visual feedback (no delay until release)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Read from ref to get fresh selection state
    const currentSelection = selectionRef.current;
    const currentIsSelected = currentSelection.isSelected(field.id, source);
    
    // Detect modifier keys
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    console.log('[FieldChip] handleMouseDown:', {
      fieldName: field.columnName,
      isShift,
      isCtrlOrCmd,
      isSelected: currentIsSelected,
      selectionCount: currentSelection.selectedFields.length,
      hasAnchor: !!currentSelection.anchorFieldId,
      source
    });

    if (isShift && currentSelection.anchorFieldId && allFields) {
      // Shift+click: Select range from anchor to this field
      // Prevent default to avoid drag (we want selection, not drag)
      console.log('[FieldChip] Shift-click: calling selectRange');
      e.preventDefault();
      e.stopPropagation();
      currentSelection.selectRange(currentSelection.anchorFieldId, field.id, source, allFields);
    } else if (isCtrlOrCmd) {
      // Ctrl/Cmd+click: Toggle selection
      // Prevent default to avoid drag (we want selection, not drag)
      console.log('[FieldChip] Ctrl/Cmd-click: calling toggleSelection');
      e.preventDefault();
      e.stopPropagation();
      currentSelection.toggleSelection(field.id, source, field);
    } else if (currentIsSelected && currentSelection.selectedFields.length > 1) {
      // Field is already selected as part of multi-selection
      // DON'T change selection - preserve it for multi-field drag
      console.log('[FieldChip] Already selected in multi-selection: preserving selection for drag');
      // Let event propagate for drag to work
    } else {
      // Regular mousedown on unselected field or single selection: Select this field
      // DON'T preventDefault - allow drag to start normally
      console.log('[FieldChip] Regular mousedown: calling selectSingle');
      currentSelection.selectSingle(field.id, source, field);
      // Let event propagate for drag to work
    }
  }, [field, source, allFields]);

  // Keep onClick for compatibility
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    const currentSelection = selectionRef.current;
    const currentIsSelected = currentSelection.isSelected(field.id, source);
    
    console.log('[FieldChip] handleDragStart:', {
      fieldName: field.columnName,
      source,
      isSelected: currentIsSelected,
      selectionCount: currentSelection.selectedFields.length,
      selectedForThisSource: currentSelection.getSelectedFieldsForSource(source).length
    });
    
    // Unified drag payload structure: always use arrays
    // If this field is selected and part of multi-selection, drag all selected fields
    // Otherwise, drag just this field as a single-element array
    let fields: Field[];
    let indices: number[];
    
    if (currentIsSelected && currentSelection.selectedFields.length > 1) {
      // Multi-field drag: drag all selected fields from this source
      const selectedForSource = currentSelection.getSelectedFieldsForSource(source);
      console.log('[FieldChip] Multi-field drag:', {
        count: selectedForSource.length,
        fields: selectedForSource.map(sf => sf.field.columnName)
      });
      fields = selectedForSource.map(sf => sf.field);
      indices = selectedForSource.map(sf => {
        // Try to find the index in allFields if available
        if (allFields) {
          return allFields.findIndex(f => f.id === sf.fieldId);
        }
        return -1;
      });
    } else {
      // Single field drag: wrap in array
      console.log('[FieldChip] Single field drag');
      fields = [fieldRef.current];
      indices = indexRef.current !== undefined ? [indexRef.current] : [-1];
    }
    
    // Set custom drag image to avoid showing multiple selected fields
    // Clone only the chip element (not the wrapper) for a clean drag image
    const chipElement = e.currentTarget as HTMLElement;
    
    // Find the actual chip element (it has the 'field-chip' class)
    const actualChip = chipElement.querySelector('.field-chip') || chipElement;
    const dragImage = actualChip.cloneNode(true) as HTMLElement;
    
    // Create a wrapper for proper positioning
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.top = '-1000px';
    wrapper.style.left = '-1000px';
    wrapper.style.display = 'inline-block';
    
    // Style the drag image
    dragImage.style.opacity = '1';
    dragImage.style.position = 'relative';
    dragImage.style.display = 'inline-block';
    
    wrapper.appendChild(dragImage);
    
    // Add badge for multi-field drag
    if (fields.length > 1) {
      const badge = document.createElement('div');
      badge.textContent = fields.length.toString();
      badge.style.position = 'absolute';
      badge.style.top = '-8px';
      badge.style.right = '-8px';
      badge.style.backgroundColor = '#1976d2';
      badge.style.color = 'white';
      badge.style.borderRadius = '50%';
      badge.style.width = '20px';
      badge.style.height = '20px';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = 'bold';
      badge.style.zIndex = '1000';
      badge.style.pointerEvents = 'none';
      wrapper.appendChild(badge);
    }
    
    document.body.appendChild(wrapper);
    e.dataTransfer.setDragImage(wrapper, 10, 10);
    setTimeout(() => document.body.removeChild(wrapper), 0);
    
    // Always use the same structure: arrays for fields and indices
    e.dataTransfer.setData('application/json', JSON.stringify({
      fields,
      source: sourceRef.current,
      indices,
    }));
    e.dataTransfer.effectAllowed = 'copyMove';
    
    // Clear selection after starting drag (will apply after drag completes)
    // Use setTimeout to avoid interfering with the drag operation
    setTimeout(() => currentSelection.clearSelection(), 0);
  }, [field, source, allFields]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const currentSelection = selectionRef.current;
    const currentIsSelected = currentSelection.isSelected(field.id, source);
    
    // If field is not selected, select it first (and clear other selections)
    if (!currentIsSelected) {
      currentSelection.selectSingle(field.id, source, field);
    }
    
    // Use click coordinates for more reliable positioning
    const x = event.clientX;
    const y = event.clientY;
    
    setMenuPosition({ x, y });
  }, [field, source]);

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
