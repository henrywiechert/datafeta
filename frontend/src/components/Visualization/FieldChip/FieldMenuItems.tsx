import React, { useState } from 'react';
import { Field } from '../../../types';
import menuStyles from '../ContextMenu.module.css';
import SubMenu from '../SubMenu';
import { canBeContinuous, canBeMeasure, getFieldAggregations } from './utils';
import { DragSource } from './types';
import ColumnCastingDialog from './ColumnCastingDialog';
import DateTimePartMenu from '../../DateTime/DateTimePartMenu';
import { isSyntheticField } from '../../../utils/syntheticFields';

interface FieldMenuItemsProps {
  field: Field;
  source: DragSource;
  onUpdate: (updates: Partial<Field>) => void;
  selectedFields?: Field[]; // For bulk editing
}

const FieldMenuItems: React.FC<FieldMenuItemsProps> = ({ field, source, onUpdate, selectedFields = [] }) => {
  const [castingDialogOpen, setCastingDialogOpen] = useState(false);
  
  // Check if we're in bulk edit mode
  const isBulkEdit = selectedFields.length > 1;
  
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
  
  // Check if field is synthetic (MeasureNames/MeasureValues)
  const isSynthetic = isSyntheticField(field);
  const canChangeType = field.isTypeChangeable !== false && !isSynthetic;
  const canChangeFlavour = field.isFlavourChangeable !== false && !isSynthetic;
  
  // For bulk edit, check if all selected fields can perform the operation
  const allCanBeMeasure = isBulkEdit ? selectedFields.every(f => canBeMeasure(f)) : isFieldMeasure;
  const allCanBeContinuous = isBulkEdit ? selectedFields.every(f => canBeContinuous(f)) : isFieldContinuous;
  const allAreMeasures = isBulkEdit ? selectedFields.every(f => f.type === 'measure') : isMeasure;

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
      {/* Show bulk edit indicator if applicable */}
      {isBulkEdit && (
        <>
          <div className={menuStyles.menuItem} style={{ color: '#1976d2', fontWeight: 'bold', cursor: 'default' }}>
            Apply to {selectedFields.length} fields
          </div>
          <div className={menuStyles.separator} />
        </>
      )}
      
      {/* Show synthetic field badge if applicable (only for single field) */}
      {!isBulkEdit && isSynthetic && (
        <>
          <div className={menuStyles.menuItem} style={{ color: '#666', fontStyle: 'italic', cursor: 'default' }}>
            🔒 Synthetic Field
          </div>
          <div className={menuStyles.separator} />
        </>
      )}
      
      <div 
        className={`${menuStyles.menuItem} ${!canChangeType ? menuStyles.disabled : ''}`}
        onClick={canChangeType ? () => onUpdate({ type: 'dimension' }) : undefined}
      >
        Dimension {!isBulkEdit && field.type === 'dimension' && '✔'}
      </div>
      <div 
        className={`${menuStyles.menuItem} ${!allCanBeMeasure || !canChangeType ? menuStyles.disabled : ''}`} 
        onClick={allCanBeMeasure && canChangeType ? () => onUpdate({ type: 'measure' }) : undefined}
      >
        Measure {!isBulkEdit && field.type === 'measure' && '✔'}
      </div>
      
      <div className={menuStyles.separator} />

      <div 
        className={`${menuStyles.menuItem} ${!canChangeFlavour ? menuStyles.disabled : ''}`}
        onClick={canChangeFlavour ? () => onUpdate({ flavour: 'discrete' }) : undefined}
      >
        Discrete {!isBulkEdit && field.flavour === 'discrete' && '✔'}
      </div>
      <div 
        className={`${menuStyles.menuItem} ${!allCanBeContinuous || !canChangeFlavour ? menuStyles.disabled : ''}`}
        onClick={allCanBeContinuous && canChangeFlavour ? () => onUpdate({ flavour: 'continuous' }) : undefined}
      >
        Continuous {!isBulkEdit && field.flavour === 'continuous' && '✔'}
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
        <DateTimePartMenu field={field} onUpdate={onUpdate} />
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
      
      {allAreMeasures && availableAggregations.length > 0 && <div className={menuStyles.separator} />}

      {allAreMeasures && availableAggregations.map(agg => (
        <div key={agg} className={menuStyles.menuItem} onClick={() => onUpdate({ aggregation: agg })}>
          {agg} {!isBulkEdit && field.aggregation === agg && '✔'}
        </div>
      ))}

      {/* Bar Sort Order - shown for measures on axes */}
      {allAreMeasures && isInAxisDropZone && (
        <>
          <div className={menuStyles.separator} />
          <SubMenu label="Bar Sort Order">
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ barSortOrder: 'none' })}>
              None (Natural Order) {!isBulkEdit && (!field.barSortOrder || field.barSortOrder === 'none') && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ barSortOrder: 'asc' })}>
              Ascending ↑ {!isBulkEdit && field.barSortOrder === 'asc' && '✔'}
            </div>
            <div className={menuStyles.menuItem} onClick={() => onUpdate({ barSortOrder: 'desc' })}>
              Descending ↓ {!isBulkEdit && field.barSortOrder === 'desc' && '✔'}
            </div>
          </SubMenu>
        </>
      )}

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
