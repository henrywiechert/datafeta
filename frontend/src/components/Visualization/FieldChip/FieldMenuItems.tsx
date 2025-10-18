import React, { useState } from 'react';
import { Field, DateTimePart } from '../../../types';
import menuStyles from '../ContextMenu.module.css';
import SubMenu from '../SubMenu';
import { canBeContinuous, canBeMeasure, getFieldAggregations } from './utils';
import { DragSource } from './types';
import ColumnCastingDialog from './ColumnCastingDialog';

interface FieldMenuItemsProps {
  field: Field;
  source: DragSource;
  onUpdate: (updates: Partial<Field>) => void;
}

const FieldMenuItems: React.FC<FieldMenuItemsProps> = ({ field, source, onUpdate }) => {
  const [castingDialogOpen, setCastingDialogOpen] = useState(false);
  
  const isMeasure = field.type === 'measure';
  const availableAggregations = getFieldAggregations(field);
  const isFieldContinuous = canBeContinuous(field);
  const isFieldMeasure = canBeMeasure(field);
  const isInAxisDropZone = source === 'X_AXIS' || source === 'Y_AXIS';
  const isDateTime = field.dataType === 'datetime';
  const hasCasting = field.castType !== undefined;
  // Allow casting for any field - user can configure it regardless of type
  // Backend will handle the casting attempt
  const canCastField = !isInAxisDropZone; // Only in available fields panel, not on axes

  // DateTime parts list
  const dateTimeParts: DateTimePart[] = [
    'year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 
    'millisecond', 'microsecond', 'nanosecond'
  ];

  // Helper to capitalize first letter
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const handleCastingConfirm = (config: any) => {
    if (config === null) {
      // Remove casting
      onUpdate({ castType: undefined, castReplacement: undefined });
    } else {
      // Apply casting
      onUpdate({ 
        castType: config.cast_type,
        castReplacement: config.replacement_pattern
      });
    }
    setCastingDialogOpen(false);
  };

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
        Continuous {field.flavour === 'continuous' && '✔'}
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
      
      {/* DateTime Part Selection - shown for datetime fields */}
      {isDateTime && (
        <>
          <div className={menuStyles.separator} />

          <div 
            className={menuStyles.menuItem} 
            onClick={() => onUpdate({ dateTimePart: undefined, dateTimeMode: undefined })}
          >
            Full DateTime {!field.dateTimePart && !field.dateTimeMode && '✔'}
          </div>

          <SubMenu label="Distinct Parts">
            {dateTimeParts.map(part => (
              <div 
                key={part}
                className={menuStyles.menuItem} 
                onClick={() => onUpdate({ dateTimePart: part, dateTimeMode: 'distinct' })}
              >
                {capitalize(part)} {field.dateTimePart === part && field.dateTimeMode === 'distinct' && '✔'}
              </div>
            ))}
          </SubMenu>

          <SubMenu label="Timeline Parts">
            {dateTimeParts.map(part => (
              <div 
                key={part}
                className={menuStyles.menuItem} 
                onClick={() => onUpdate({ dateTimePart: part, dateTimeMode: 'timeline' })}
              >
                {capitalize(part)} {field.dateTimePart === part && field.dateTimeMode === 'timeline' && '✔'}
              </div>
            ))}
          </SubMenu>
        </>
      )}

      {/* Column Casting - shown for numeric fields or numeric measures in available fields panel */}
      {canCastField && !isInAxisDropZone && (
        <>
          <div className={menuStyles.separator} />
          <div 
            className={menuStyles.menuItem}
            onClick={() => setCastingDialogOpen(true)}
          >
            Configure Casting {hasCasting && '✔'}
          </div>
        </>
      )}
      
      {isMeasure && availableAggregations.length > 0 && <div className={menuStyles.separator} />}

      {isMeasure && availableAggregations.map(agg => (
        <div key={agg} className={menuStyles.menuItem} onClick={() => onUpdate({ aggregation: agg })}>
          {agg} {field.aggregation === agg && '✔'}
        </div>
      ))}

      <ColumnCastingDialog
        open={castingDialogOpen}
        columnName={field.columnName}
        currentConfig={
          field.castType ? {
            cast_type: field.castType,
            replacement_pattern: field.castReplacement
          } : undefined
        }
        onConfirm={handleCastingConfirm}
        onCancel={() => setCastingDialogOpen(false)}
      />
    </>
  );
};

export default FieldMenuItems;
