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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);

    // Calculate drop position for reordering
    if (fields.length > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      // Find the closest drop position by checking distances to field boundaries
      let closestIndex = 0;
      let minDistance = Infinity;
      
      // Check distance to the start (before first field)
      const startDistance = Math.abs(x - 0);
      if (startDistance < minDistance) {
        minDistance = startDistance;
        closestIndex = 0;
      }
      
      // Check distances to positions between and after fields
      for (let i = 0; i < fields.length; i++) {
        const fieldStart = (i / fields.length) * rect.width;
        const fieldEnd = ((i + 1) / fields.length) * rect.width;
        const fieldCenter = (fieldStart + fieldEnd) / 2;
        
        // If mouse is in the right half of this field, consider dropping after it
        if (x > fieldCenter) {
          const afterDistance = Math.abs(x - fieldEnd);
          if (afterDistance < minDistance) {
            minDistance = afterDistance;
            closestIndex = i + 1;
          }
        }
      }
      
      setDragOverIndex(closestIndex);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only set isOver to false if we're actually leaving the drop zone
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsOver(false);
      setDragOverIndex(null);
    }
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
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const fieldWidth = rect.width / fields.length;
        let targetIndex = Math.floor(x / fieldWidth);
        
        // Adjust target index if dragging to the right
        if (targetIndex > sourceIndex) {
          targetIndex = Math.min(targetIndex, fields.length - 1);
        } else {
          targetIndex = Math.max(targetIndex, 0);
        }
        
        if (targetIndex !== sourceIndex) {
          onReorderFields(axis, sourceIndex, targetIndex);
        }
      } else {
        // Handle drops from available fields or cross-axis moves
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const fieldWidth = fields.length > 0 ? rect.width / fields.length : rect.width;
        const insertIndex = fields.length > 0 ? Math.floor(x / fieldWidth) : 0;
        
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
          <React.Fragment key={field.id}>
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