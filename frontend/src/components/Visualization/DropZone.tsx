import React, { useRef, useState, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { ItemTypes, FieldDragItem } from './FieldChip'; // Import the type
import styles from './DropZone.module.css';

interface DropZoneProps {
  children?: React.ReactNode;
  onDrop: (item: FieldDragItem, insertIndex?: number) => void;
  axis: 'x' | 'y'; // To identify which axis this is
}

const DropZone: React.FC<DropZoneProps> = ({ children, onDrop, axis }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [dropLine, setDropLine] = useState<{ index: number; position: 'before' | 'after' } | null>(null);

  const getInsertIndex = useCallback((clientX: number, clientY: number) => {
    if (!ref.current) return undefined;
    
    const childElements = Array.from(ref.current.children).filter(child => 
      child.classList.contains('field-chip')
    ) as HTMLElement[];
    
    // If no field chips, insert at beginning
    if (childElements.length === 0) return 0;
    
    // Find which child element the mouse is closest to
    // Since fields are arranged horizontally side by side, we use clientX for positioning
    for (let i = 0; i < childElements.length; i++) {
      const element = childElements[i];
      const rect = element.getBoundingClientRect();
      const elementCenter = rect.left + rect.width / 2;
      if (clientX < elementCenter) {
        return i; // Insert before this element
      }
    }
    
    // If we get here, insert at the end
    return childElements.length;
  }, []);

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemTypes.FIELD,
    hover: (item: FieldDragItem, monitor) => {
      if (!monitor.isOver({ shallow: true })) return;
      
      const clientOffset = monitor.getClientOffset();
      if (clientOffset) {
        const insertIndex = getInsertIndex(clientOffset.x, clientOffset.y);
        // Only show drop line if we're reordering within the same axis
        if (item.source === (axis === 'x' ? 'X_AXIS' : 'Y_AXIS') && insertIndex !== undefined) {
          setDropLine({ 
            index: insertIndex, 
            position: insertIndex === 0 ? 'before' : 'after' 
          });
        } else {
          setDropLine(null);
        }
      }
    },
    drop: (item: FieldDragItem, monitor) => {
      const clientOffset = monitor.getClientOffset();
      if (clientOffset) {
        const insertIndex = getInsertIndex(clientOffset.x, clientOffset.y);
        onDrop(item, insertIndex);
      } else {
        onDrop(item);
      }
      setDropLine(null);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver({ shallow: true }),
      canDrop: !!monitor.canDrop(),
    }),
  });

  drop(ref);

  const isActive = isOver && canDrop;
  let backgroundColor = '#f9f9f9';
  if (isActive) {
    backgroundColor = '#e3f2fd'; // A light blue to indicate a valid drop
  } else if (canDrop) {
    backgroundColor = '#fffde7'; // A light yellow to indicate it's a potential target
  }

  return (
    <div
      ref={ref}
      className={styles.dropZone}
      style={{ backgroundColor, position: 'relative' }}
    >
      {children}
      {dropLine && (
        <div
          className={styles.dropLine}
          style={{
            position: 'absolute',
            backgroundColor: '#2196f3',
            zIndex: 1000,
            ...(() => {
              if (!ref.current) return {};
              
              const fieldChips = Array.from(ref.current.children).filter(child => 
                child.classList.contains('field-chip')
              ) as HTMLElement[];
              
              const dropZoneRect = ref.current.getBoundingClientRect();
              
              if (fieldChips.length === 0) {
                // No field chips, position at the start after the label
                const labelElement = ref.current.querySelector('strong');
                if (labelElement) {
                  const labelRect = labelElement.getBoundingClientRect();
                  return {
                    width: '2px',
                    height: 'calc(100% - 32px)', // Account for padding
                    left: `${labelRect.right - dropZoneRect.left + 8}px`,
                    top: '16px'
                  };
                }
              }
              
              if (dropLine.index < fieldChips.length) {
                // Position before a specific field chip
                const targetChip = fieldChips[dropLine.index];
                const chipRect = targetChip.getBoundingClientRect();
                
                return {
                  width: '2px',
                  height: 'calc(100% - 32px)', // Account for padding
                  left: `${chipRect.left - dropZoneRect.left - 2}px`,
                  top: '16px'
                };
              } else if (fieldChips.length > 0) {
                // Position after the last field chip
                const lastChip = fieldChips[fieldChips.length - 1];
                const chipRect = lastChip.getBoundingClientRect();
                
                return {
                  width: '2px',
                  height: 'calc(100% - 32px)', // Account for padding
                  left: `${chipRect.right - dropZoneRect.left + 2}px`,
                  top: '16px'
                };
              }
              
              return {};
            })()
          }}
        />
      )}
    </div>
  );
};

export default DropZone; 