import { Field } from '../../../types';
import { DragSource } from './types';

/**
 * Get chip styling based on field flavour (discrete/continuous)
 */
export const getChipStyles = (field: Field | null) => {
  if (!field) return {};
  
  if (field.flavour === 'discrete') {
    return {
      backgroundColor: '#e3f2fd',
      border: '1px solid #1976d2',
    };
  } else if (field.flavour === 'continuous') {
    return {
      backgroundColor: '#e8f5e8',
      border: '1px solid #388e3c',
    };
  }
  return {};
};

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
  isInvalidOnAxis: boolean,
  isSelected: boolean,
  baseStyles: Record<string, string>
): string => {
  const isAxis = source === 'X_AXIS' || source === 'Y_AXIS';
  const classes = [
    baseStyles.chip,
    field.flavour === 'continuous' ? baseStyles.continuous : baseStyles.discrete,
    source === 'AVAILABLE_FIELDS' ? baseStyles.textOnly : baseStyles.framed,
    isAxis ? baseStyles.axis : '',
    isInvalidOnAxis ? baseStyles.invalidAxisField : '',
    isSelected ? baseStyles.selected : '',
    'field-chip'
  ];
  
  return classes.filter(Boolean).join(' ');
};
