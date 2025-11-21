import React, { forwardRef } from 'react';
import { Field } from '../../../types';
import styles from './FieldChipLabel.module.css';
import { DragSource } from './types';
import { getFieldDisplayName } from '../../../utils/fieldUtils';

interface FieldChipLabelProps {
  field: Field;
  source: DragSource;
}

const FieldChipLabel = forwardRef<HTMLSpanElement, FieldChipLabelProps>(
  ({ field, source }, ref) => {
    const fieldName = getFieldDisplayName(field);
    const aggregationText = field.aggregation ? ` (${field.aggregation})` : '';
    const flavourText = ` [${field.flavour}]`;
    const dataTypeText = ` (${field.dataType})`;
    
    // Check if this is a virtual column
    // @ts-ignore - is_virtual is not in Field type yet but we set it in availableFieldsWithVirtual
    const isVirtual = (field as any).is_virtual;
    
    // Add sort indicator for measures on axes with active sorting
    const isOnAxis = source === 'X_AXIS' || source === 'Y_AXIS';
    const sortIndicator = isOnAxis && field.type === 'measure' && field.barSortOrder && field.barSortOrder !== 'none'
      ? ` ${field.barSortOrder === 'asc' ? '↑' : '↓'}`
      : '';
    
    return (
      <span
        ref={ref}
        className={`${styles.chipText} ${source === 'AVAILABLE_FIELDS' ? styles.availableFieldsText : styles.axisFieldsText}`}
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: source === 'AVAILABLE_FIELDS' ? 'block' : 'inline-block',
          width: '100%',
          maxWidth: '100%',
          fontSize: source === 'AVAILABLE_FIELDS' ? undefined : '12px',
          textAlign: source === 'AVAILABLE_FIELDS' ? 'left' : undefined,
        }}
      >
        <span className={`${styles.symbol} ${field.flavour === 'continuous' ? styles.continuousSymbol : styles.discreteSymbol}`}>
          {isVirtual ? 'ƒ' : '#'}
        </span>
        {fieldName}
        {aggregationText}
        {sortIndicator}
        {source !== 'AVAILABLE_FIELDS' && flavourText}
        {source !== 'AVAILABLE_FIELDS' && dataTypeText}
      </span>
    );
  }
);

FieldChipLabel.displayName = 'FieldChipLabel';

// Memoize to prevent unnecessary re-renders
export default React.memo(FieldChipLabel, (prevProps, nextProps) => {
  return (
    prevProps.field.columnName === nextProps.field.columnName &&
    prevProps.field.aggregation === nextProps.field.aggregation &&
    prevProps.field.flavour === nextProps.field.flavour &&
    prevProps.field.dataType === nextProps.field.dataType &&
    prevProps.field.type === nextProps.field.type &&
    prevProps.field.barSortOrder === nextProps.field.barSortOrder &&
    prevProps.source === nextProps.source &&
    // @ts-ignore - is_virtual is not in Field type but we check it
    (prevProps.field as any).is_virtual === (nextProps.field as any).is_virtual
  );
});
