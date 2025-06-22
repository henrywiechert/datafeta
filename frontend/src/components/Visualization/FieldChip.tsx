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

    // Ensure flavour has a default value if not set
    if (!newField.flavour) {
      newField.flavour = 'discrete';
    }

    // Enforce constraint: string fields can only be discrete
    if (newField.dataType === 'string' && updates.flavour === 'continuous') {
      // Don't allow the change, keep it discrete
      return;
    }

    onUpdate(newField);
    handleCloseMenu();
  };

  const renderMenuItems = () => {
    const isMeasure = field.type === 'measure';
    const availableAggregations = getAvailableAggregations(field);
    const canBeContinuous = field.dataType !== 'string'; // String fields can only be discrete

    return (
      <>
        <div className={menuStyles.menuItem} onClick={() => handleUpdate({ type: 'dimension' })}>
          Dimension {field.type === 'dimension' && '✔'}
        </div>
        <div className={menuStyles.menuItem} onClick={() => handleUpdate({ type: 'measure' })}>
          Measure {field.type === 'measure' && '✔'}
        </div>
        
        <div className={menuStyles.separator} />

        <div className={menuStyles.menuItem} onClick={() => handleUpdate({ flavour: 'discrete' })}>
          Discrete {field.flavour === 'discrete' && '✔'}
        </div>
        <div 
          className={`${menuStyles.menuItem} ${!canBeContinuous ? menuStyles.disabled : ''}`} 
          onClick={canBeContinuous ? () => handleUpdate({ flavour: 'continuous' }) : undefined}
        >
          Continuous {field.flavour === 'continuous' && '✔'} {!canBeContinuous && '(String fields only)'}
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
        className={`${styles.chip} ${field.flavour === 'continuous' ? styles.continuous : styles.discrete} ${source === 'AVAILABLE_FIELDS' ? styles.textOnly : styles.framed} field-chip`}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onContextMenu={handleContextMenu}
        style={{ 
          opacity: isDragging ? 0.5 : 1,
          cursor: 'grab'
        }}
      >
        <span className={`${styles.symbol} ${field.flavour === 'continuous' ? styles.continuousSymbol : styles.discreteSymbol}`}>#</span> {field.columnName} {field.aggregation && `(${field.aggregation})`} [{field.flavour}] ({field.dataType})
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