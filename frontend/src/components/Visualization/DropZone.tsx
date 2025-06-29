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

  // Helper function to get valid insert index for new fields based on flavour
  const getValidInsertIndex = (field: Field): number => {
    if (field.flavour === 'discrete') {
      // Discrete fields go before any continuous fields
      // Find the first continuous field and insert before it
      const firstContinuousIndex = fields.findIndex(f => f.flavour === 'continuous');
      return firstContinuousIndex === -1 ? fields.length : firstContinuousIndex;
    } else {
      // Continuous fields go after all discrete fields
      return fields.length;
    }
  };

  // Helper function to get valid target index for reordering within same axis
  const getValidTargetIndex = (field: Field, requestedIndex: number, sourceIndex: number): number => {
    // Create a copy of fields without the field being moved
    const fieldsWithoutSource = fields.filter((_, index) => index !== sourceIndex);
    
    if (field.flavour === 'discrete') {
      // Discrete fields can only be placed before continuous fields
      const firstContinuousIndex = fieldsWithoutSource.findIndex(f => f.flavour === 'continuous');
      const maxIndex = firstContinuousIndex === -1 ? fieldsWithoutSource.length : firstContinuousIndex;
      return Math.min(requestedIndex, maxIndex);
    } else {
      // Continuous fields can only be placed after discrete fields
      const lastDiscreteIndex = fieldsWithoutSource.map((f, i) => ({ field: f, index: i }))
        .filter(({ field }) => field.flavour === 'discrete')
        .pop()?.index;
      const minIndex = lastDiscreteIndex === undefined ? 0 : lastDiscreteIndex + 1;
      return Math.max(requestedIndex, minIndex);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Clear any pending drag leave timeout
    if (dragLeaveTimeoutRef.current) {
      clearTimeout(dragLeaveTimeoutRef.current);
      dragLeaveTimeoutRef.current = null;
    }
    
    setIsOver(true);

    // Try to get the dragged field info to determine valid drop positions
    try {
      const dragData = e.dataTransfer.getData('application/json');
      if (dragData) {
        const { field, source, index: sourceIndex } = JSON.parse(dragData);
        
        // Calculate drop position based on ordering rules
        if (source === (axis === 'x' ? 'X_AXIS' : 'Y_AXIS') && sourceIndex !== undefined) {
          // Reordering within same axis - show visual indicator at valid position
          const mouseX = e.clientX;
          const fieldChips = e.currentTarget.querySelectorAll('.field-chip');
          let requestedIndex = 0;
          
          // Calculate requested position based on mouse
          if (fieldChips.length > 0) {
            const firstChip = fieldChips[0] as HTMLElement;
            const firstChipRect = firstChip.getBoundingClientRect();
            
            if (mouseX < firstChipRect.left) {
              requestedIndex = 0;
            } else {
              let found = false;
              for (let i = 0; i < fieldChips.length; i++) {
                const chipRect = (fieldChips[i] as HTMLElement).getBoundingClientRect();
                const chipCenter = chipRect.left + chipRect.width / 2;
                
                if (mouseX < chipCenter) {
                  requestedIndex = i;
                  found = true;
                  break;
                }
              }
              
              if (!found) {
                requestedIndex = fields.length;
              }
            }
          }
          
          // Adjust for the field being moved
          if (requestedIndex > sourceIndex) {
            requestedIndex = Math.max(requestedIndex - 1, sourceIndex);
          }
          
          // Get the valid index based on ordering rules
          const validIndex = getValidTargetIndex(field, requestedIndex, sourceIndex);
          setDragOverIndex(validIndex);
        } else {
          // New field drop - show indicator at valid position based on flavour
          const validIndex = getValidInsertIndex(field);
          setDragOverIndex(validIndex);
        }
        return;
      }
    } catch (error) {
      // If we can't parse drag data, fall back to basic positioning
    }

    // Fallback: Calculate drop position based on mouse position only
    if (fields.length > 0) {
      const mouseX = e.clientX;
      const fieldChips = e.currentTarget.querySelectorAll('.field-chip');
      
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
        // Calculate target index based on mouse position
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
        
        // Enforce ordering rule: discrete fields before continuous fields
        targetIndex = getValidTargetIndex(field, targetIndex, sourceIndex);
        
        if (targetIndex !== sourceIndex) {
          onReorderFields(axis, sourceIndex, targetIndex);
        }
      } else {
        // Handle drops from available fields or cross-axis moves
        // Calculate insert index based on flavour ordering rule
        const insertIndex = getValidInsertIndex(field);
        onDrop(field, source, insertIndex);
      }
    } catch (error) {
      console.error('Error parsing drag data:', error);
    }
  };

  const dropZoneClass = `${styles.dropZone} ${isOver ? styles.isOver : ''}`;

  return (
    <div style={{ display: 'flex' }}>
      <div style={{ fontWeight: 'normal', marginRight: '5px', minWidth: '6px', textAlign: 'left', display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
      <div
        className={dropZoneClass}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ flex: 1, padding: '2px 4px', minHeight: '28px', display: 'flex', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px', position: 'relative', width: '100%' }}>
          {fields.map((field, index) => {
            // Check if this is the boundary between discrete and continuous fields
            const isDiscreteToContinuousBoundary = 
              index > 0 && 
              fields[index - 1].flavour === 'discrete' && 
              field.flavour === 'continuous';
              
            return (
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
                
                {/* Visual separator between discrete and continuous fields */}
                {isDiscreteToContinuousBoundary && (
                  <div style={{
                    width: '1px',
                    height: '16px',
                    backgroundColor: '#ccc',
                    margin: '0 2px'
                  }} />
                )}
                
                <FieldChip
                  field={field}
                  onUpdate={onFieldUpdate}
                  source={axis === 'x' ? 'X_AXIS' : 'Y_AXIS'}
                  index={index}
                />
              </React.Fragment>
            );
          })}
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
            fontSize: '12px',
            padding: '1px 0'
          }}>
          </div>
        )}
      </div>
    </div>
  );
};

export default DropZone;