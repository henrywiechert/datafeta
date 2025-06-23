import React, { useState } from 'react';
import { Field } from '../../types';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import styles from './FieldChip.module.css';
import ContextMenu from './ContextMenu';
import SubMenu from './SubMenu';
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
    
    // Get the element's position
    const rect = event.currentTarget.getBoundingClientRect();
    
    // Position menu relative to the element, not the exact click point
    // This provides more consistent positioning across different layouts
    const x = rect.left;
    const y = rect.bottom + 5; // 5px below the element
    
    setMenuPosition({ x, y });
  };

  const handleCloseMenu = () => {
    setMenuPosition(null);
  };

  const handleUpdate = (updates: Partial<Field>) => {
    // Ensure we're working with the current field state, not a stale closure
    const currentField = field;
    const newField = { ...currentField, ...updates };

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

    // Enforce constraint: datetime fields can only be measures
    if (newField.dataType === 'datetime' && updates.type === 'measure') {
      // Don't allow the change, keep it as dimension
      return;
    }

    // If changing to string data type, force flavour to discrete
    if (updates.dataType === 'string') {
      newField.flavour = 'discrete';
    }

    // If changing to datetime data type, force type to dimension
    if (updates.dataType === 'datetime') {
      newField.type = 'dimension';
      delete newField.aggregation; // Remove any aggregation since it's now a dimension
    }

    onUpdate(newField);
    handleCloseMenu();
  };

  const renderMenuItems = () => {
    const isMeasure = field.type === 'measure';
    const availableAggregations = getAvailableAggregations(field);
    const canBeContinuous = field.dataType !== 'string'; // String fields can only be discrete
    const canBeMeasure = field.dataType !== 'datetime'; // DateTime fields can only be dimensions
    const isInAxisDropZone = source === 'X_AXIS' || source === 'Y_AXIS';

    return (
      <>
        <div className={menuStyles.menuItem} onClick={() => handleUpdate({ type: 'dimension' })}>
          Dimension {field.type === 'dimension' && '✔'}
        </div>
        <div 
          className={`${menuStyles.menuItem} ${!canBeMeasure ? menuStyles.disabled : ''}`} 
          onClick={canBeMeasure ? () => handleUpdate({ type: 'measure' }) : undefined}
        >
          Measure {field.type === 'measure' && '✔'} {!canBeMeasure && '(DateTime fields only)'}
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
        
        {/* Only show data type selection when field is in available fields panel */}
        {!isInAxisDropZone && (
          <>
            <div className={menuStyles.separator} />

            <SubMenu label={`Data Type (${field.dataType})`}>
              <div className={menuStyles.menuItem} onClick={() => handleUpdate({ dataType: 'string' })}>
                String {field.dataType === 'string' && '✔'}
              </div>
              <div className={menuStyles.menuItem} onClick={() => handleUpdate({ dataType: 'integer' })}>
                Integer {field.dataType === 'integer' && '✔'}
              </div>
              <div className={menuStyles.menuItem} onClick={() => handleUpdate({ dataType: 'float' })}>
                Float {field.dataType === 'float' && '✔'}
              </div>
              <div className={menuStyles.menuItem} onClick={() => handleUpdate({ dataType: 'datetime' })}>
                DateTime {field.dataType === 'datetime' && '✔'}
              </div>
            </SubMenu>
          </>
        )}
        
        {isMeasure && availableAggregations.length > 0 && <div className={menuStyles.separator} />}

        {isMeasure && availableAggregations.map(agg => (
          <div key={agg} className={menuStyles.menuItem} onClick={() => handleUpdate({ aggregation: agg })}>
            {agg} {field.aggregation === agg && '✔'}
          </div>
        ))}
      </>
    );
  };

  // Compose the full label text for tooltip and chip
  const fullLabel = `${field.columnName}${field.aggregation ? `(${field.aggregation})` : ''} [${field.flavour}] (${field.dataType})`;

  return (
    <>
      <Tooltip 
        title={<span style={{whiteSpace: 'nowrap', display: 'block'}}>{fullLabel}</span>} 
        enterDelay={500} 
        arrow
        PopperProps={{
          modifiers: [
            {
              name: 'preventOverflow',
              options: {
                altAxis: true,
                tether: true,
                padding: 0,
                boundary: 'window',
              },
            },
            {
              name: 'maxWidth',
              enabled: false,
            },
          ],
        }}
        componentsProps={{
          tooltip: {
            sx: {
              maxWidth: 'none',
              padding: '6px 12px',
              fontSize: '13px',
            }
          }
        }}
      >
        <span>
          <Chip
            className={`${styles.chip} ${field.flavour === 'continuous' ? styles.continuous : styles.discrete} ${source === 'AVAILABLE_FIELDS' ? styles.textOnly : styles.framed} field-chip`}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onContextMenu={handleContextMenu}
            style={{
              opacity: isDragging ? 0.5 : 1,
              cursor: 'grab',
              width: source === 'AVAILABLE_FIELDS' ? undefined : 240,
              maxWidth: source === 'AVAILABLE_FIELDS' ? undefined : 240,
              minWidth: source === 'AVAILABLE_FIELDS' ? undefined : 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              fontSize: source === 'AVAILABLE_FIELDS' ? undefined : '12px',
            }}
            label={
              <span className={source === 'AVAILABLE_FIELDS' ? styles.chipText : undefined} style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: source === 'AVAILABLE_FIELDS' ? 'block' : 'inline-block',
                width: '100%',
                fontSize: source === 'AVAILABLE_FIELDS' ? undefined : '12px',
                textAlign: source === 'AVAILABLE_FIELDS' ? 'left' : undefined,
              }}>
                <span className={`${styles.symbol} ${field.flavour === 'continuous' ? styles.continuousSymbol : styles.discreteSymbol}`}>#</span>
                {field.columnName} {field.aggregation && `(${field.aggregation})`} [{field.flavour}] ({field.dataType})
              </span>
            }
          />
        </span>
      </Tooltip>
      {menuPosition && (
        <ContextMenu position={menuPosition} onClose={handleCloseMenu}>
          {renderMenuItems()}
        </ContextMenu>
      )}
    </>
  );
};

export default FieldChip;