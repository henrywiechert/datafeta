import { useCallback, useRef, useEffect } from 'react';
import { Field } from '../../../types';
import { DragSource } from './types';
import { useSelection } from '../../../contexts/SelectionContext';

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
 */
export const useFieldSelection = ({
  field,
  source,
  allFields,
}: UseFieldSelectionProps): UseFieldSelectionReturn => {
  const selection = useSelection();
  const selectionRef = useRef(selection);
  
  // Keep selection ref up-to-date
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const isSelected = selection.isSelected(field.id, source);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const currentSelection = selectionRef.current;
    const currentIsSelected = currentSelection.isSelected(field.id, source);
    
    // Detect modifier keys
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    console.log('[useFieldSelection] handleMouseDown:', {
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
      console.log('[useFieldSelection] Shift-click: calling selectRange');
      e.preventDefault();
      e.stopPropagation();
      currentSelection.selectRange(currentSelection.anchorFieldId, field.id, source, allFields);
    } else if (isCtrlOrCmd) {
      // Ctrl/Cmd+click: Toggle selection
      console.log('[useFieldSelection] Ctrl/Cmd-click: calling toggleSelection');
      e.preventDefault();
      e.stopPropagation();
      currentSelection.toggleSelection(field.id, source, field);
    } else if (currentIsSelected && currentSelection.selectedFields.length > 1) {
      // Field is already selected as part of multi-selection
      // Preserve selection for multi-field drag
      console.log('[useFieldSelection] Already selected in multi-selection: preserving selection for drag');
    } else {
      // Regular mousedown: Select this field
      console.log('[useFieldSelection] Regular mousedown: calling selectSingle');
      currentSelection.selectSingle(field.id, source, field);
    }
  }, [field, source, allFields]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentSelection = selectionRef.current;
    const currentIsSelected = currentSelection.isSelected(field.id, source);
    
    // If field is not selected, select it first
    if (!currentIsSelected) {
      currentSelection.selectSingle(field.id, source, field);
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
