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
  if (source !== 'AVAILABLE_FIELDS') {
    return {
      width: 240,
      maxWidth: 240,
      minWidth: 160,
    };
  } else {
    return {
      width: '100%',
      maxWidth: '100%',
    };
  }
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
  const classes = [
    baseStyles.chip,
    field.flavour === 'continuous' ? baseStyles.continuous : baseStyles.discrete,
    source === 'AVAILABLE_FIELDS' ? baseStyles.textOnly : baseStyles.framed,
    isInvalidOnAxis ? baseStyles.invalidAxisField : '',
    isSelected ? baseStyles.selected : '',
    'field-chip'
  ];
  
  return classes.filter(Boolean).join(' ');
};
