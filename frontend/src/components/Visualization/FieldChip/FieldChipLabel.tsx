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
        {getFieldDisplayName(field)} {field.aggregation && `(${field.aggregation})`} [{field.flavour}] ({field.dataType})
      </span>
    );
  }
);

FieldChipLabel.displayName = 'FieldChipLabel';

export default FieldChipLabel;
