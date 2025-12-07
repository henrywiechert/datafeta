import { useCallback, useEffect, useRef, useState } from 'react';
import { Field } from '../../../types';
import { DragSource } from './types';
import { useSelection } from '../../../contexts/SelectionContext';
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
 */
export const useDragHandlers = ({
  field,
  source,
  index,
  allFields,
}: UseDragHandlersProps): UseDragHandlersReturn => {
  const [isDragging, setIsDragging] = useState(false);
  const selection = useSelection();
  
  // Use refs to avoid recreating callbacks when field/source/index change
  const fieldRef = useRef(field);
  const sourceRef = useRef(source);
  const indexRef = useRef(index);
  const selectionRef = useRef(selection);
  
  // Update refs when props change
  useEffect(() => {
    fieldRef.current = field;
    sourceRef.current = source;
    indexRef.current = index;
    selectionRef.current = selection;
  }, [field, source, index, selection]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    const currentSelection = selectionRef.current;
    const currentIsSelected = currentSelection.isSelected(field.id, source);
    
    console.log('[useDragHandlers] handleDragStart:', {
      fieldName: field.columnName,
      source,
      isSelected: currentIsSelected,
      selectionCount: currentSelection.selectedFields.length,
      selectedForThisSource: currentSelection.getSelectedFieldsForSource(source).length
    });
    
    // Unified drag payload structure: always use arrays
    let fields: Field[];
    let indices: number[];
    
    if (currentIsSelected && currentSelection.selectedFields.length > 1) {
      // Multi-field drag: drag all selected fields from this source
      const selectedForSource = currentSelection.getSelectedFieldsForSource(source);
      console.log('[useDragHandlers] Multi-field drag:', {
        count: selectedForSource.length,
        fields: selectedForSource.map(sf => sf.field.columnName)
      });
      fields = selectedForSource.map(sf => sf.field);
      indices = selectedForSource.map(sf => {
        if (allFields) {
          return allFields.findIndex(f => f.id === sf.fieldId);
        }
        return -1;
      });
    } else {
      // Single field drag: wrap in array
      console.log('[useDragHandlers] Single field drag');
      fields = [fieldRef.current];
      indices = indexRef.current !== undefined ? [indexRef.current] : [-1];
    }
    
    // Create and set custom drag image
    const chipElement = e.currentTarget as HTMLElement;
    const dragImageWrapper = createDragImageWithBadge(chipElement, fields.length);
    setDragImage(e, dragImageWrapper);
    
    // Set drag data
    e.dataTransfer.setData('application/json', createDragPayload(fields, sourceRef.current, indices));
    e.dataTransfer.effectAllowed = 'copyMove';
    
    // Clear selection after starting drag
    setTimeout(() => currentSelection.clearSelection(), 0);
  }, [field, source, allFields]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return {
    isDragging,
    handleDragStart,
    handleDragEnd,
  };
};
