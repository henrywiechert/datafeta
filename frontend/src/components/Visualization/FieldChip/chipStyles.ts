// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../../types';
import { DragSource } from './types';

/**
 * Get width properties for chip based on source
 */
export const getChipWidthProps = (source: DragSource) => {
  // Axes: keep the previous fixed sizing (these drop zones are visually tuned around it).
  if (source === 'X_AXIS' || source === 'Y_AXIS') {
    return { width: 180, maxWidth: 180, minWidth: 180 };
  }

  // Available fields: fill row
  if (source === 'AVAILABLE_FIELDS') {
    return { width: '100%', maxWidth: '100%' };
  }

  // Other zones: fill the container and allow shrinking (grid/flex minmax(0,1fr))
  return { width: '100%', maxWidth: '100%', minWidth: 0 };
};

/**
 * Get CSS class names for chip based on field and state
 */
export const getChipClassNames = (
  field: Field,
  source: DragSource,
  isInvalid: boolean,
  isSelected: boolean,
  baseStyles: Record<string, string>
): string => {
  const isAxis = source === 'X_AXIS' || source === 'Y_AXIS';
  const isDisabledOnAxis = isAxis && field.disabled === true;
  const classes = [
    baseStyles.chip,
    field.flavour === 'continuous' ? baseStyles.continuous : baseStyles.discrete,
    source === 'AVAILABLE_FIELDS' ? baseStyles.textOnly : baseStyles.framed,
    isAxis ? baseStyles.axis : '',
    isInvalid ? baseStyles.invalidField : '',
    isDisabledOnAxis ? baseStyles.disabledAxisField : '',
    // An invalid chip keeps its red fill while selected. The flavour `selected`
    // backgrounds are more specific than `.invalidField`, so letting both
    // classes land repaints the chip blue/green on click and back to red on Esc.
    // Disabled keeps gray even when selected so the state stays visible.
    isSelected && !isInvalid && !isDisabledOnAxis ? baseStyles.selected : '',
    'field-chip'
  ];
  
  return classes.filter(Boolean).join(' ');
};
