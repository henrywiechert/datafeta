import { useState, DragEvent } from 'react';

/**
 * Custom hook to handle drag and drop operations in the fields panel
 * @param onRemoveFromAxis Function to call when removing a field from an axis
 */
export function useFieldsPanelDrag(onRemoveFromAxis: (fieldId: string) => void) {
  const [isDragOver, setIsDragOver] = useState(false);

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
      const { field, source } = data;
      
      // Only remove if dragging from an axis (not from available fields)
      if (source === 'X_AXIS' || source === 'Y_AXIS') {
        onRemoveFromAxis(field.id);
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
