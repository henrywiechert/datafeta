import { useCallback } from 'react';
import { Field } from '../../../types';
import { DragSource } from './types';
import { useSelectionStore } from '../../../stores/selectionStore';
import { useIsFieldSelected } from '../../../stores/useFieldSelected';

interface UseFieldSelectionProps {
  field: Field;
  source: DragSource;
  allFields?: Field[];
}

interface UseFieldSelectionReturn {
  isSelected: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleClick: (e: React.MouseEvent) => void;
  handleContextMenu: (e: React.MouseEvent) => { x: number; y: number };
}

/**
 * Custom hook to handle field selection logic
 * Supports single-click, Ctrl/Cmd+click (toggle), and Shift+click (range)
 * 
 * Performance: Uses Zustand selectors for granular subscriptions.
 * The hook only subscribes to:
 * - isSelected for THIS field (via useIsFieldSelected)
 * - anchorFieldId (for shift-click range selection)
 * - selectedFields.length (for multi-selection drag behavior)
 * 
 * Actions are read directly from store.getState() in handlers
 * to avoid unnecessary subscriptions.
 */
export const useFieldSelection = ({
  field,
  source,
  allFields,
}: UseFieldSelectionProps): UseFieldSelectionReturn => {
  // Granular subscription - only this field's selection status
  const isSelected = useIsFieldSelected(field.id, source);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Get actions and state directly from store (no subscription)
    const store = useSelectionStore.getState();
    const currentIsSelected = store.isSelected(field.id, source);
    
    // Detect modifier keys
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift && store.anchorFieldId && allFields) {
      // Shift+click: Select range from anchor to this field
      e.preventDefault();
      e.stopPropagation();
      store.selectRange(store.anchorFieldId, field.id, source, allFields);
    } else if (isCtrlOrCmd) {
      // Ctrl/Cmd+click: Toggle selection
      e.preventDefault();
      e.stopPropagation();
      store.toggleSelection(field.id, source, field);
    } else if (currentIsSelected && store.selectedFields.length > 1) {
      // Field is already selected as part of multi-selection
      // Preserve selection for multi-field drag
    } else {
      // Regular mousedown: Select this field
      store.selectSingle(field.id, source, field);
    }
  }, [field, source, allFields]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Get state directly from store (no subscription)
    const store = useSelectionStore.getState();
    const currentIsSelected = store.isSelected(field.id, source);
    
    // If field is not selected, select it first
    if (!currentIsSelected) {
      store.selectSingle(field.id, source, field);
    }
    
    return { x: e.clientX, y: e.clientY };
  }, [field, source]);

  return {
    isSelected,
    handleMouseDown,
    handleClick,
    handleContextMenu,
  };
};
