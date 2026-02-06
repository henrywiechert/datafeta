import { useCallback, useRef, useState } from 'react';
import { Field } from '../../../types';
import { DragSource } from './types';
import { useSelectionStore, SelectedField } from '../../../stores/selectionStore';
import { createDragImageWithBadge, setDragImage, createDragPayload } from './dragImageUtils';
import { setDragData, clearDragData } from '../../../utils/dragDataStore';

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
 * 
 * Performance: Uses Zustand getState() to read selection state only
 * when drag starts, avoiding unnecessary subscriptions and re-renders.
 */
export const useDragHandlers = ({
  field,
  source,
  index,
  allFields,
}: UseDragHandlersProps): UseDragHandlersReturn => {
  const [isDragging, setIsDragging] = useState(false);
  
  // Use refs to avoid recreating callbacks when field/source/index change
  const fieldRef = useRef(field);
  const sourceRef = useRef(source);
  const indexRef = useRef(index);
  
  // Update refs when props change (no effect dependencies on selection)
  fieldRef.current = field;
  sourceRef.current = source;
  indexRef.current = index;

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    
    // Read selection state directly without subscribing
    const store = useSelectionStore.getState();
    const currentIsSelected = store.isSelected(field.id, source);
    
    // Unified drag payload structure: always use arrays
    let fields: Field[];
    let indices: number[];
    
    if (currentIsSelected && store.selectedFields.length > 1) {
      // Multi-field drag: drag all selected fields from this source
      const selectedForSource = store.getSelectedFieldsForSource(source);
      fields = selectedForSource.map((sf: SelectedField) => sf.field);
      indices = selectedForSource.map((sf: SelectedField) => {
        if (allFields) {
          return allFields.findIndex(f => f.id === sf.fieldId);
        }
        return -1;
      });
    } else {
      // Single field drag: wrap in array
      fields = [fieldRef.current];
      indices = indexRef.current !== undefined ? [indexRef.current] : [-1];
    }
    
    // Create and set custom drag image
    const chipElement = e.currentTarget as HTMLElement;
    const dragImageWrapper = createDragImageWithBadge(chipElement, fields.length);
    setDragImage(e, dragImageWrapper);
    
    // Primary channel: store drag data in memory (immune to browser dataTransfer bugs)
    setDragData({ fields, source: sourceRef.current, indices });
    
    // Secondary channel: also set on dataTransfer for any external consumers
    const payload = createDragPayload(fields, sourceRef.current, indices);
    try {
      e.dataTransfer.setData('application/json', payload);
    } catch {
      // Some browsers may reject application/json after extended usage
      try { e.dataTransfer.setData('text/plain', payload); } catch { /* ignore */ }
    }
    e.dataTransfer.effectAllowed = 'copyMove';
    
    // Clear selection after starting drag
    setTimeout(() => store.clearSelection(), 0);
  }, [field, source, allFields]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    clearDragData();
  }, []);

  return {
    isDragging,
    handleDragStart,
    handleDragEnd,
  };
};
