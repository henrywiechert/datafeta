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
          #
        </span>
        {fieldName}
        {aggregationText}
        {source !== 'AVAILABLE_FIELDS' && flavourText}
        {source !== 'AVAILABLE_FIELDS' && dataTypeText}
      </span>
    );
  }
);

FieldChipLabel.displayName = 'FieldChipLabel';

export default FieldChipLabel;
