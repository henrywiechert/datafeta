import React from 'react';
import { Field } from '../../../types';
import menuStyles from '../ContextMenu.module.css';
import SubMenu from '../SubMenu';
import { canBeContinuous, canBeMeasure, getFieldAggregations } from './utils';
import { DragSource } from './types';

interface FieldMenuItemsProps {
  field: Field;
  source: DragSource;
  onUpdate: (updates: Partial<Field>) => void;
}

const FieldMenuItems: React.FC<FieldMenuItemsProps> = ({ field, source, onUpdate }) => {
  const isMeasure = field.type === 'measure';
  const availableAggregations = getFieldAggregations(field);
  const isFieldContinuous = canBeContinuous(field);
  const isFieldMeasure = true;
  const isInAxisDropZone = source === 'X_AXIS' || source === 'Y_AXIS';

  return (
    <>
      <div className={menuStyles.menuItem} onClick={() => onUpdate({ type: 'dimension' })}>
        Dimension {field.type === 'dimension' && '✔'}
      </div>
      <div 
        className={`${menuStyles.menuItem} ${!isFieldMeasure ? menuStyles.disabled : ''}`} 
        onClick={isFieldMeasure ? () => onUpdate({ type: 'measure' }) : undefined}
      >
        Measure {field.type === 'measure' && '✔'}
      </div>
      
      <div className={menuStyles.separator} />

      <div className={menuStyles.menuItem} onClick={() => onUpdate({ flavour: 'discrete' })}>
        Discrete {field.flavour === 'discrete' && '✔'}
      </div>
      <div 
        className={`${menuStyles.menuItem} ${!isFieldContinuous ? menuStyles.disabled : ''}`} 
        onClick={isFieldContinuous ? () => onUpdate({ flavour: 'continuous' }) : undefined}
      >
        Continuous {field.flavour === 'continuous' && '✔'} {!isFieldContinuous && '(String fields only)'}
      </div>
      
      {/* Only show data type selection when field is in available fields panel */}
      {!isInAxisDropZone && (
        <>
          <div className={menuStyles.separator} />

          <SubMenu label={`Data Type (${field.dataType})`}>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ dataType: 'string' })}>
              String {field.dataType === 'string' && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ dataType: 'integer' })}>
              Integer {field.dataType === 'integer' && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ dataType: 'float' })}>
              Float {field.dataType === 'float' && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ dataType: 'datetime' })}>
              DateTime {field.dataType === 'datetime' && '✔'}
            </div>
          </SubMenu>
        </>
      )}
      
      {isMeasure && availableAggregations.length > 0 && <div className={menuStyles.separator} />}

      {isMeasure && availableAggregations.map(agg => (
        <div key={agg} className={menuStyles.menuItem} onClick={() => onUpdate({ aggregation: agg })}>
          {agg} {field.aggregation === agg && '✔'}
        </div>
      ))}
    </>
  );
};

export default FieldMenuItems;
