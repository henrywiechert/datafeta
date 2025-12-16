import { useState, DragEvent } from 'react';
import { useSelectionStore } from '../stores/selectionStore';

/**
 * Custom hook to handle drag and drop operations in the fields panel
 * @param onRemoveFromAxis Function to call when removing a single field from an axis
 * @param onRemoveMultipleFromAxis Optional function to call when removing multiple fields (batched)
 */
export function useFieldsPanelDrag(
  onRemoveFromAxis: (fieldId: string) => void,
  onRemoveMultipleFromAxis?: (fieldIds: string[]) => void
) {
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Get clearSelection action (stable reference, never causes re-render)
  const clearSelection = useSelectionStore((s: any) => s.clearSelection);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    try {
      // Only show visual feedback for axis fields
      const dataString = e.dataTransfer.getData('application/json');
      if (dataString) {
        const data = JSON.parse(dataString);
        if (data.source === 'X_AXIS' || data.source === 'Y_AXIS') {
          setIsDragOver(true);
        }
      }
    } catch (error) {
      // Ignore parsing errors during drag over
      // This is expected since we can't access data during dragover in some browsers
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Check if we're actually leaving the element (not entering a child element)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      
      // Handle unified payload format (always arrays) and legacy format
      let fields = data.fields;
      const source = data.source;
      
      // Backward compatibility: normalize legacy single-field format
      if (!fields && data.field) {
        fields = [data.field];
      }
      
      // Only remove if dragging from an axis (not from available fields)
      if ((source === 'X_AXIS' || source === 'Y_AXIS') && fields && fields.length > 0) {
        // Use batch removal for multiple fields to avoid race conditions
        if (fields.length > 1 && onRemoveMultipleFromAxis) {
          const fieldIds = fields.map((f: any) => f.id);
          onRemoveMultipleFromAxis(fieldIds);
        } else {
          // Single field removal
          fields.forEach((f: any) => onRemoveFromAxis(f.id));
        }
        
        // Clear selection after successful removal
        clearSelection();
      }
    } catch (error) {
      console.error('Error processing drop event:', error);
    }
  };

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
}
