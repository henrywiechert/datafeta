import React, { useState } from 'react';
import { Field } from '../../types';
import FieldChip, { DragSource } from './FieldChip';
import styles from './DropZone.module.css';

interface DropZoneProps {
  children?: React.ReactNode;
  onDrop: (field: Field, source: DragSource, index?: number) => void;
  axis: 'x' | 'y';
  fields: Field[];
  onFieldUpdate: (field: Field) => void;
  onRemoveField: (fieldId: string) => void;
  onReorderFields?: (axis: 'x' | 'y', fromIndex: number, toIndex: number) => void;
}

const DropZone: React.FC<DropZoneProps> = ({ 
  children, 
  onDrop, 
  axis, 
  fields, 
  onFieldUpdate,
  onRemoveField,
  onReorderFields
}) => {
  const [isOver, setIsOver] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragLeaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Reset drag state when any drag operation ends globally
  React.useEffect(() => {
    const handleGlobalDragEnd = () => {
      setIsOver(false);
      setDragOverIndex(null);
      if (dragLeaveTimeoutRef.current) {
        clearTimeout(dragLeaveTimeoutRef.current);
        dragLeaveTimeoutRef.current = null;
      }
    };

    document.addEventListener('dragend', handleGlobalDragEnd);
    return () => {
      document.removeEventListener('dragend', handleGlobalDragEnd);
      if (dragLeaveTimeoutRef.current) {
        clearTimeout(dragLeaveTimeoutRef.current);
      }
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Clear any pending drag leave timeout
    if (dragLeaveTimeoutRef.current) {
      clearTimeout(dragLeaveTimeoutRef.current);
      dragLeaveTimeoutRef.current = null;
    }
    
    setIsOver(true);

    // Calculate drop position for reordering based on actual field positions
    if (fields.length > 0) {
      const dropZoneRect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX;
      
      // Get all field chip elements
      const fieldChips = e.currentTarget.querySelectorAll('.field-chip');
      let closestIndex = 0;
      let minDistance = Infinity;
      
      // Check if mouse is before the first field
      if (fieldChips.length > 0) {
        const firstChip = fieldChips[0] as HTMLElement;
        const firstChipRect = firstChip.getBoundingClientRect();
        
        if (mouseX < firstChipRect.left) {
          setDragOverIndex(0);
          return;
        }
      }
      
      // Check positions between and after fields
      for (let i = 0; i < fieldChips.length; i++) {
        const chipRect = (fieldChips[i] as HTMLElement).getBoundingClientRect();
        const chipCenter = chipRect.left + chipRect.width / 2;
        
        // If mouse is in the left half of this chip, drop before it
        if (mouseX < chipCenter) {
          setDragOverIndex(i);
          return;
        }
      }
      
      // If we get here, mouse is after all fields
      setDragOverIndex(fields.length);
    } else {
      setDragOverIndex(0);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Use a timeout to handle drag leave more reliably
    // This prevents flickering when dragging over child elements
    dragLeaveTimeoutRef.current = setTimeout(() => {
      setIsOver(false);
      setDragOverIndex(null);
    }, 50);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    setDragOverIndex(null);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { field, source, index: sourceIndex } = data;
      
      // Handle reordering within the same axis
      if (source === (axis === 'x' ? 'X_AXIS' : 'Y_AXIS') && onReorderFields && sourceIndex !== undefined) {
        // Use the same logic as dragOver for consistency
        const mouseX = e.clientX;
        const fieldChips = e.currentTarget.querySelectorAll('.field-chip');
        let targetIndex = 0;
        
        // Check if mouse is before the first field
        if (fieldChips.length > 0) {
          const firstChip = fieldChips[0] as HTMLElement;
          const firstChipRect = firstChip.getBoundingClientRect();
          
          if (mouseX < firstChipRect.left) {
            targetIndex = 0;
          } else {
            // Check positions between and after fields
            let found = false;
            for (let i = 0; i < fieldChips.length; i++) {
              const chipRect = (fieldChips[i] as HTMLElement).getBoundingClientRect();
              const chipCenter = chipRect.left + chipRect.width / 2;
              
              if (mouseX < chipCenter) {
                targetIndex = i;
                found = true;
                break;
              }
            }
            
            if (!found) {
              targetIndex = fields.length;
            }
          }
        }
        
        // Adjust for the field being moved (since it will be removed first)
        if (targetIndex > sourceIndex) {
          targetIndex = Math.max(targetIndex - 1, sourceIndex);
        }
        
        if (targetIndex !== sourceIndex) {
          onReorderFields(axis, sourceIndex, targetIndex);
        }
      } else {
        // Handle drops from available fields or cross-axis moves
        // Use the dragOverIndex that was calculated during drag over
        const insertIndex = dragOverIndex !== null ? dragOverIndex : fields.length;
        onDrop(field, source, insertIndex);
      }
    } catch (error) {
      console.error('Error parsing drag data:', error);
    }
  };



  const dropZoneClass = `${styles.dropZone} ${isOver ? styles.isOver : ''}`;

  return (
    <div
      className={dropZoneClass}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div style={{ fontWeight: 'bold', marginRight: '8px' }}>
        {children}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
        {fields.map((field, index) => (
          <React.Fragment key={`${field.id}-${field.type}-${field.flavour}-${field.dataType}-${field.aggregation || 'none'}`}>
            {/* Drop indicator line */}
            {dragOverIndex === index && (
              <div style={{
                width: '2px',
                height: '24px',
                backgroundColor: '#1976d2',
                zIndex: 1000
              }} />
            )}
            <FieldChip
              field={field}
              onUpdate={onFieldUpdate}
              source={axis === 'x' ? 'X_AXIS' : 'Y_AXIS'}
              index={index}
            />
          </React.Fragment>
        ))}
        {/* Drop indicator at the end */}
        {dragOverIndex === fields.length && (
          <div style={{
            width: '2px',
            height: '24px',
            backgroundColor: '#1976d2',
            zIndex: 1000
          }} />
        )}
      </div>
      {fields.length === 0 && (
        <div style={{ 
          color: '#666', 
          fontStyle: 'italic', 
          fontSize: '14px',
          padding: '8px 0'
        }}>
          Drop fields here
        </div>
      )}
    </div>
  );
};

export default DropZone; 