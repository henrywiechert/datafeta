import React, { useState } from 'react';
import { Field } from '../../types';
import FieldChip, { DragSource } from './FieldChip';
import { useSelectionStore } from '../../stores/selectionStore';
import styles from './DropZone.module.css';

// Style constants
const DROPZONE_STYLES = {
  container: { display: 'flex' },
  label: { 
    fontWeight: 'normal' as const, 
    marginRight: '5px', 
    minWidth: '6px', 
    textAlign: 'left' as const, 
    display: 'flex', 
    alignItems: 'center' 
  },
  dropArea: { 
    flex: 1, 
    padding: '2px 4px', 
    minHeight: '28px', 
    display: 'flex', 
    alignItems: 'center' 
  },
  fieldsWrapper: { 
    display: 'flex', 
    flexWrap: 'wrap' as const, 
    alignItems: 'center', 
    gap: '2px', 
    position: 'relative' as const, 
    width: '100%' 
  },
  dropIndicator: {
    width: '2px',
    height: '24px',
    backgroundColor: '#1976d2',
    zIndex: 1000
  },
  flavourSeparator: {
    width: '1px',
    height: '16px',
    backgroundColor: '#ccc',
    margin: '0 2px'
  },
  emptyMessage: { 
    color: '#666', 
    fontStyle: 'italic' as const, 
    fontSize: '12px',
    padding: '1px 0'
  }
} as const;

// Helper function to parse drag data safely
// Returns unified structure with arrays for fields and indices
// Legacy single-field payloads are normalized to arrays
function parseDragData(dataTransfer: DataTransfer): { fields: Field[]; source: DragSource; indices: number[] } | null {
  try {
    const dragData = dataTransfer.getData('application/json');
    if (dragData) {
      const parsed = JSON.parse(dragData);
      
      // Normalize legacy single-field format to array format
      if (parsed.field && !parsed.fields) {
        return {
          fields: [parsed.field],
          source: parsed.source,
          indices: parsed.index !== undefined ? [parsed.index] : [-1],
        };
      }
      
      // Return unified format (already arrays)
      return {
        fields: parsed.fields || [],
        source: parsed.source,
        indices: parsed.indices || [],
      };
    }
  } catch (error) {
    console.error('Error parsing drag data:', error);
  }
  return null;
}

// Helper function to convert axis to DragSource
function axisToDragSource(axis: 'x' | 'y'): DragSource {
  return axis === 'x' ? 'X_AXIS' : 'Y_AXIS';
}

// Helper function to convert DragSource to axis
function dragSourceToAxis(source: DragSource): 'x' | 'y' | null {
  if (source === 'X_AXIS') return 'x';
  if (source === 'Y_AXIS') return 'y';
  return null;
}

interface DropZoneProps {
  children?: React.ReactNode;
  onDrop: (field: Field | Field[], source: DragSource, index?: number) => void;
  axis: 'x' | 'y';
  fields: Field[];
  onFieldUpdate: (fields: Field | Field[]) => void;
  onRemoveField: (fieldId: string) => void;
  onReorderFields?: (axis: 'x' | 'y', fromIndex: number, toIndex: number) => void;
  onMoveFieldBetweenAxes?: (fieldId: string, fromAxis: 'x' | 'y', toAxis: 'x' | 'y', insertIndex?: number) => void;
}

const DropZone: React.FC<DropZoneProps> = ({ 
  children, 
  onDrop, 
  axis, 
  fields, 
  onFieldUpdate,
  onRemoveField,
  onReorderFields,
  onMoveFieldBetweenAxes
}) => {
  const [isOver, setIsOver] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragLeaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Get clearSelection action (stable reference, never causes re-render)
  const clearSelection = useSelectionStore((s: any) => s.clearSelection);

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

  // Helper function to get valid insert index for new fields from a requested position
  const getValidInsertIndexFromPosition = (field: Field, requestedIndex: number): number => {
    if (field.flavour === 'discrete') {
      // Discrete fields can only be placed before continuous fields
      const firstContinuousIndex = fields.findIndex(f => f.flavour === 'continuous');
      const maxIndex = firstContinuousIndex === -1 ? fields.length : firstContinuousIndex;
      return Math.min(requestedIndex, maxIndex);
    } else {
      // Continuous fields can only be placed after discrete fields
      const lastDiscreteIndex = fields.map((f, i) => ({ field: f, index: i }))
        .filter(({ field }) => field.flavour === 'discrete')
        .pop()?.index;
      const minIndex = lastDiscreteIndex === undefined ? 0 : lastDiscreteIndex + 1;
      return Math.max(requestedIndex, minIndex);
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

  // Helper function to calculate drop index from mouse position
  const calculateDropIndexFromMouse = (mouseX: number, containerElement: EventTarget & Element): number => {
    const fieldChips = containerElement.querySelectorAll('.field-chip');
    
    if (fieldChips.length === 0) {
      return 0;
    }
    
    // Check if mouse is before the first field
    const firstChip = fieldChips[0] as HTMLElement;
    const firstChipRect = firstChip.getBoundingClientRect();
    
    if (mouseX < firstChipRect.left) {
      return 0;
    }
    
    // Check positions between and after fields
    for (let i = 0; i < fieldChips.length; i++) {
      const chipRect = (fieldChips[i] as HTMLElement).getBoundingClientRect();
      const chipCenter = chipRect.left + chipRect.width / 2;
      
      if (mouseX < chipCenter) {
        return i;
      }
    }
    
    // Mouse is after all fields
    return fields.length;
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
    const dragData = parseDragData(e.dataTransfer);
    if (dragData) {
      const { fields, source, indices } = dragData;
      
      // Get the first field for positioning (determines where the group will be placed)
      const firstField = fields.length > 0 ? fields[0] : null;
      const sourceIndex = indices.length > 0 ? indices[0] : undefined;
      
      if (!firstField) {
        // No field data available, use fallback
        setDragOverIndex(calculateDropIndexFromMouse(e.clientX, e.currentTarget));
        return;
      }
      
      // Calculate drop position based on ordering rules
      if (source === axisToDragSource(axis) && sourceIndex !== undefined && sourceIndex >= 0) {
        // Reordering within same axis - show visual indicator at valid position
        let requestedIndex = calculateDropIndexFromMouse(e.clientX, e.currentTarget);
        
        // Adjust for the field being moved
        if (requestedIndex > sourceIndex) {
          requestedIndex = Math.max(requestedIndex - 1, sourceIndex);
        }
        
        // Get the valid index based on ordering rules
        const validIndex = getValidTargetIndex(firstField, requestedIndex, sourceIndex);
        setDragOverIndex(validIndex);
      } else {
        // New field drop - calculate position from mouse and adjust for ordering rules
        const requestedIndex = calculateDropIndexFromMouse(e.clientX, e.currentTarget);
        const validIndex = getValidInsertIndexFromPosition(firstField, requestedIndex);
        setDragOverIndex(validIndex);
      }
      return;
    }

    // Fallback: Calculate drop position based on mouse position only
    setDragOverIndex(calculateDropIndexFromMouse(e.clientX, e.currentTarget));
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
    
    const data = parseDragData(e.dataTransfer);
    if (!data || data.fields.length === 0) {
      return;
    }
    
    const { fields, source, indices } = data;
    const firstField = fields[0];
    const sourceIndex = indices.length > 0 && indices[0] >= 0 ? indices[0] : undefined;
    
    // Process all fields: auto-configure DateTime fields as timeline when dropped on axis
    const processedFields = fields.map(f => {
      let newField = { ...f };
      if (newField.dataType === 'datetime' && newField.flavour === 'continuous') {
        newField = {
          ...newField,
          dateTimePart: undefined,
          dateTimeMode: 'timeline'
        };
      }
      return newField;
    });
    
    // Handle reordering within the same axis (single field only)
    if (source === axisToDragSource(axis) && onReorderFields && sourceIndex !== undefined && fields.length === 1) {
      // Calculate target index based on mouse position
      let targetIndex = calculateDropIndexFromMouse(e.clientX, e.currentTarget);
      
      // Adjust for the field being moved (since it will be removed first)
      if (targetIndex > sourceIndex) {
        targetIndex = Math.max(targetIndex - 1, sourceIndex);
      }
      
      // Enforce ordering rule: discrete fields before continuous fields
      targetIndex = getValidTargetIndex(firstField, targetIndex, sourceIndex);
      
      if (targetIndex !== sourceIndex) {
        onReorderFields(axis, sourceIndex, targetIndex);
      }
      // Clear selection after successful drop
      clearSelection();
      return;
    }
    
    // Handle cross-axis moves atomically (single field only)
    if ((source === 'X_AXIS' || source === 'Y_AXIS') && source !== axisToDragSource(axis) && fields.length === 1) {
      if (onMoveFieldBetweenAxes) {
        const fromAxis = dragSourceToAxis(source);
        const toAxis = axis;
        // Calculate position from mouse and adjust for ordering rules
        const requestedIndex = calculateDropIndexFromMouse(e.clientX, e.currentTarget);
        const insertIndex = getValidInsertIndexFromPosition(firstField, requestedIndex);
        if (fromAxis) {
          onMoveFieldBetweenAxes(firstField.id, fromAxis, toAxis, insertIndex);
        }
        // Clear selection after successful drop
        clearSelection();
        return;
      }
    }
    
    // Handle all other drops (from available fields, cross-axis multi-field, etc.)
    // Calculate position from mouse and adjust for ordering rules
    const requestedIndex = calculateDropIndexFromMouse(e.clientX, e.currentTarget);
    const insertIndex = getValidInsertIndexFromPosition(firstField, requestedIndex);
    
    // Pass array to onDrop (supports both single and multiple fields)
    onDrop(processedFields, source, insertIndex);
    
    // Clear selection after successful drop
    clearSelection();
  };

  const dropZoneClass = `${styles.dropZone} ${isOver ? styles.isOver : ''}`;

  return (
    <div style={DROPZONE_STYLES.container}>
      <div style={DROPZONE_STYLES.label}>
        {children}
      </div>
      <div
        className={dropZoneClass}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={DROPZONE_STYLES.dropArea}
      >
        <div style={DROPZONE_STYLES.fieldsWrapper}>
          {fields.map((field, index) => {
            // Determine if this field exists in current availableFields (by columnName)
            // We don't have availableFields here; rely on a marker set upstream on field.isInvalid
            const isInvalid = (field as any).isInvalid === true;
            // Check if this is the boundary between discrete and continuous fields
            const isDiscreteToContinuousBoundary = 
              index > 0 && 
              fields[index - 1].flavour === 'discrete' && 
              field.flavour === 'continuous';
              
            return (
              <React.Fragment key={field.id}>
                {/* Drop indicator line */}
                {dragOverIndex === index && (
                  <div style={DROPZONE_STYLES.dropIndicator} />
                )}
                
                {/* Visual separator between discrete and continuous fields */}
                {isDiscreteToContinuousBoundary && (
                  <div style={DROPZONE_STYLES.flavourSeparator} />
                )}
                
                <FieldChip
                  field={field}
                  onUpdate={onFieldUpdate}
                  source={axisToDragSource(axis)}
                  index={index}
                  isInvalidOnAxis={isInvalid}
                  allFields={fields}
                />
              </React.Fragment>
            );
          })}
          {/* Drop indicator at the end */}
          {dragOverIndex === fields.length && (
            <div style={DROPZONE_STYLES.dropIndicator} />
          )}
        </div>
        {fields.length === 0 && (
          <div style={DROPZONE_STYLES.emptyMessage}>
          </div>
        )}
      </div>
    </div>
  );
};

// Memoize DropZone to prevent re-renders when props haven't changed
export default React.memo(DropZone, (prevProps, nextProps) => {
  // Compare field array by reference - if it's the same array, don't re-render
  // This works because the reducer creates new arrays only when fields actually change
  return (
    prevProps.fields === nextProps.fields &&
    prevProps.axis === nextProps.axis &&
    prevProps.onDrop === nextProps.onDrop &&
    prevProps.onFieldUpdate === nextProps.onFieldUpdate &&
    prevProps.onRemoveField === nextProps.onRemoveField &&
    prevProps.onReorderFields === nextProps.onReorderFields &&
    prevProps.onMoveFieldBetweenAxes === nextProps.onMoveFieldBetweenAxes
  );
});