import React, { useState } from 'react';
import { Field } from '../../types';
import styles from './FieldChip.module.css';
import ContextMenu from './ContextMenu';
import menuStyles from './ContextMenu.module.css';
import { getAvailableAggregations } from '../../utils/fieldUtils';

export type DragSource = 'AVAILABLE_FIELDS' | 'X_AXIS' | 'Y_AXIS';

interface FieldChipProps {
  field: Field;
  source: DragSource;
  onUpdate: (field: Field) => void;
  index?: number;
}

const FieldChip: React.FC<FieldChipProps> = ({ field, source, onUpdate, index }) => {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify({
      field,
      source,
      index
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const handleCloseMenu = () => {
    setMenuPosition(null);
  };

  const handleUpdate = (updates: Partial<Field>) => {
    const newField = { ...field, ...updates };

    if (updates.type === 'dimension') {
      delete newField.aggregation;
    }

    onUpdate(newField);
    handleCloseMenu();
  };

  const renderMenuItems = () => {
    const isMeasure = field.type === 'measure';
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
        className={`${styles.chip} field-chip`}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onContextMenu={handleContextMenu}
        style={{ 
          opacity: isDragging ? 0.5 : 1,
          cursor: 'grab'
        }}
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