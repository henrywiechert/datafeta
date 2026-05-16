// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { forwardRef } from 'react';
import { Field } from '../../../types';
import styles from './FieldChipLabel.module.css';
import { DragSource } from './types';
import { useFieldDisplayName } from '../../../hooks/useFieldDisplayName';

interface FieldChipLabelProps {
  field: Field;
  source: DragSource;
  displayNameOverride?: string;
}

const FieldChipLabel = forwardRef<HTMLSpanElement, FieldChipLabelProps>(
  ({ field, source, displayNameOverride }, ref) => {
    // Get alias-aware display name function from context
    const getDisplayName = useFieldDisplayName();
    const fieldName = displayNameOverride ?? getDisplayName(field);
    const aggregationText = field.aggregation ? ` (${field.aggregation})` : '';
    const flavourText = ` [${field.flavour}]`;
    const dataTypeText = ` (${field.dataType})`;
    
    // Check if this is a virtual column
    const isVirtual = field.is_virtual;
    
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
        {isOnAxis && flavourText}
        {isOnAxis && dataTypeText}
      </span>
    );
  }
);

FieldChipLabel.displayName = 'FieldChipLabel';

// Note: We intentionally do NOT memoize this component because it uses
// useFieldDisplayName hook which reads from context. The alias lookup
// can change independently of props, so memoization based only on props
// would prevent updates when aliases change.
export default FieldChipLabel;
