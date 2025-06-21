import React, { useRef, useState } from 'react';
import { useDrag } from 'react-dnd';
import { Field } from '../../types';
import styles from './FieldChip.module.css';
import ContextMenu from './ContextMenu';
import menuStyles from './ContextMenu.module.css';
import { getAvailableAggregations } from '../../utils/fieldUtils';

// Define the type for the drag item
export const ItemTypes = {
  FIELD: 'field',
};

// Define the source locations for a drag operation
export type DragSource = 'AVAILABLE_FIELDS' | 'X_AXIS' | 'Y_AXIS';

// The item that gets passed during a drag operation
export interface FieldDragItem {
    field: Field;
    source: DragSource;
    index?: number; // Index of the field in its current axis for reordering
}

interface FieldChipProps {
  field: Field;
  source: DragSource; // The chip now needs to know its own location
  onUpdate: (field: Field) => void;
  index?: number; // Index of the field in its axis for reordering
}

const FieldChip: React.FC<FieldChipProps> = ({ field, source, onUpdate, index }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.FIELD,
    // Include the source and index in the dragged item
    item: { field: { ...field }, source: source, index: index } as FieldDragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(ref);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const handleCloseMenu = () => {
    setMenuPosition(null);
  };

  const handleUpdate = (updates: Partial<Field>) => {
    const newField = { ...field, ...updates };

    // If we are changing the type to dimension, we must remove the aggregation
    if (updates.type === 'dimension') {
      delete newField.aggregation;
    }

    onUpdate(newField);
    handleCloseMenu();
  };

  const renderMenuItems = () => {
    const isMeasure = field.type === 'measure';
    // Use the rules engine to get the list of aggregations
    const availableAggregations = getAvailableAggregations(field);

    return (
      <>
        <div className={menuStyles.menuItem} onClick={() => handleUpdate({ type: 'dimension' })}>
          Dimension {field.type === 'dimension' && '✔'}
        </div>
        <div className={menuStyles.menuItem} onClick={() => handleUpdate({ type: 'measure' })}>
          Measure {field.type === 'measure' && '✔'}
        </div>
        
        {isMeasure && availableAggregations.length > 0 && <div className={menuStyles.separator} />}

        {isMeasure && availableAggregations.map(agg => (
          <div key={agg} className={menuStyles.menuItem} onClick={() => handleUpdate({ aggregation: agg })}>
            {agg} {field.aggregation === agg && '✔'}
          </div>
        ))}
      </>
    );
  };

  return (
    <>
      <div
        ref={ref}
        className={`${styles.chip} field-chip`}
        onContextMenu={handleContextMenu}
        style={{ opacity: isDragging ? 0.5 : 1 }}
      >
        {field.columnName} {field.aggregation && `(${field.aggregation})`}
      </div>
      {menuPosition && (
        <ContextMenu position={menuPosition} onClose={handleCloseMenu}>
          {renderMenuItems()}
        </ContextMenu>
      )}
    </>
  );
};

export default FieldChip; 