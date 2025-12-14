import { useCallback, useEffect, useRef, useState } from 'react';
import { Field } from '../../../types';
import { DragSource } from './types';
import { useSelectionCallbacks } from '../../../contexts/SelectionContext';
import { createDragImageWithBadge, setDragImage, createDragPayload } from './dragImageUtils';

interface UseDragHandlersProps {
  field: Field;
  source: DragSource;
  index?: number;
  allFields?: Field[];
}

interface UseDragHandlersReturn {
  isDragging: boolean;
  handleDragStart: (e: React.DragEvent) => void;
  handleDragEnd: () => void;
}

/**
 * Custom hook to handle drag-and-drop logic for field chips
 * Extracts drag start, drag end, and drag image creation
 * Uses useSelectionCallbacks to avoid re-renders when selection changes
 */
export const useDragHandlers = ({
  field,
  source,
  index,
  allFields,
}: UseDragHandlersProps): UseDragHandlersReturn => {
  const [isDragging, setIsDragging] = useState(false);
  const callbacks = useSelectionCallbacks();
  
  // Use refs to avoid recreating callbacks when field/source/index change
  const fieldRef = useRef(field);
  const sourceRef = useRef(source);
  const indexRef = useRef(index);
  const callbacksRef = useRef(callbacks);
  const allFieldsRef = useRef(allFields);
  
  // Update refs when props change (synchronously to avoid stale closures)
  fieldRef.current = field;
  sourceRef.current = source;
  indexRef.current = index;
  callbacksRef.current = callbacks;
  allFieldsRef.current = allFields;

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    const cb = callbacksRef.current;
    const currentField = fieldRef.current;
    const currentSource = sourceRef.current;
    const currentAllFields = allFieldsRef.current;
    const currentIsSelected = cb.isSelected(currentField.id, currentSource);
    const selectedCount = cb.getSelectedCount();
    const selectedForSource = cb.getSelectedFieldsForSource(currentSource);
    
    console.log('[useDragHandlers] handleDragStart:', {
      fieldName: currentField.columnName,
      source: currentSource,
      isSelected: currentIsSelected,
      selectionCount: selectedCount,
      selectedForThisSource: selectedForSource.length
    });
    
    // Unified drag payload structure: always use arrays
    let fields: Field[];
    let indices: number[];
    
    if (currentIsSelected && selectedCount > 1) {
      // Multi-field drag: drag all selected fields from this source
      console.log('[useDragHandlers] Multi-field drag:', {
        count: selectedForSource.length,
        fields: selectedForSource.map(sf => sf.field.columnName)
      });
      fields = selectedForSource.map(sf => sf.field);
      indices = selectedForSource.map(sf => {
        if (currentAllFields) {
          return currentAllFields.findIndex(f => f.id === sf.fieldId);
        }
        return -1;
      });
    } else {
      // Single field drag: wrap in array
      console.log('[useDragHandlers] Single field drag');
      fields = [currentField];
      indices = indexRef.current !== undefined ? [indexRef.current] : [-1];
    }
    
    // Create and set custom drag image
    const chipElement = e.currentTarget as HTMLElement;
    const dragImageWrapper = createDragImageWithBadge(chipElement, fields.length);
    setDragImage(e, dragImageWrapper);
    
    // Set drag data
    e.dataTransfer.setData('application/json', createDragPayload(fields, currentSource, indices));
    e.dataTransfer.effectAllowed = 'copyMove';
    
    // Clear selection after starting drag
    setTimeout(() => cb.clearSelection(), 0);
  }, []); // Empty deps - all values accessed via refs

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return {
    isDragging,
    handleDragStart,
    handleDragEnd,
  };
};
