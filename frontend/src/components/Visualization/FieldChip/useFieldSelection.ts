import { useCallback, useRef, useEffect, useState } from 'react';
import { Field } from '../../../types';
import { DragSource } from './types';
import { useSelectionCallbacks } from '../../../contexts/SelectionContext';

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
 * Uses useSelectionCallbacks to avoid re-renders when other fields' selection changes.
 * Only re-renders when THIS field's selection state changes (via local state).
 */
export const useFieldSelection = ({
  field,
  source,
  allFields,
}: UseFieldSelectionProps): UseFieldSelectionReturn => {
  const callbacks = useSelectionCallbacks();
  
  // Track this field's selected state locally to trigger re-renders when it changes
  // We initialize by checking current state, and update via mouse handlers
  const [isSelected, setIsSelected] = useState(() => callbacks.isSelected(field.id, source));
  
  // Use refs to avoid callback recreation when props change
  const fieldRef = useRef(field);
  const sourceRef = useRef(source);
  const allFieldsRef = useRef(allFields);
  const callbacksRef = useRef(callbacks);
  
  // Update refs synchronously
  fieldRef.current = field;
  sourceRef.current = source;
  allFieldsRef.current = allFields;
  callbacksRef.current = callbacks;

  // Sync isSelected state when field changes
  useEffect(() => {
    setIsSelected(callbacks.isSelected(field.id, source));
  }, [field.id, source, callbacks]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const cb = callbacksRef.current;
    const currentField = fieldRef.current;
    const currentSource = sourceRef.current;
    const currentAllFields = allFieldsRef.current;
    const currentIsSelected = cb.isSelected(currentField.id, currentSource);
    
    // Detect modifier keys
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift && currentAllFields) {
      // Shift+click: Select range from anchor to this field
      // We need to get anchor from the callback's ref
      e.preventDefault();
      e.stopPropagation();
      // For range selection, we get anchor from internal state via getSelectedFieldsForSource
      const selectedForSource = cb.getSelectedFieldsForSource(currentSource);
      if (selectedForSource.length > 0) {
        // Use the first selected field as anchor for range
        const anchorId = selectedForSource[0].fieldId;
        cb.selectRange(anchorId, currentField.id, currentSource, currentAllFields);
      } else {
        // No anchor, just select this one
        cb.selectSingle(currentField.id, currentSource, currentField);
      }
      // Update local state - this field should now be selected
      setIsSelected(true);
    } else if (isCtrlOrCmd) {
      // Ctrl/Cmd+click: Toggle selection
      e.preventDefault();
      e.stopPropagation();
      cb.toggleSelection(currentField.id, currentSource, currentField);
      // Update local state
      setIsSelected(!currentIsSelected);
    } else if (currentIsSelected && cb.getSelectedCount() > 1) {
      // Field is already selected as part of multi-selection
      // Preserve selection for multi-field drag
    } else {
      // Regular mousedown: Select this field
      cb.selectSingle(currentField.id, currentSource, currentField);
      // Update local state
      setIsSelected(true);
    }
  }, []); // Empty deps - all values accessed via refs

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cb = callbacksRef.current;
    const currentField = fieldRef.current;
    const currentSource = sourceRef.current;
    const currentIsSelected = cb.isSelected(currentField.id, currentSource);
    
    // If field is not selected, select it first
    if (!currentIsSelected) {
      cb.selectSingle(currentField.id, currentSource, currentField);
      setIsSelected(true);
    }
    
    return { x: e.clientX, y: e.clientY };
  }, []); // Empty deps - all values accessed via refs

  return {
    isSelected,
    handleMouseDown,
    handleClick,
    handleContextMenu,
  };
};
