import { Field } from '../../../types';

/**
 * Returns chip styling based on field flavour (discrete vs continuous)
 */
export const getChipStyles = (field: Field) => {
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
 * Safely parses drag event data and returns the field if present
 */
export const parseDragData = (e: React.DragEvent): { field: Field | null } => {
  try {
    const fieldData = e.dataTransfer.getData('application/json');
    if (fieldData) {
      const parsedData = JSON.parse(fieldData);
      const { field } = parsedData;
      if (field) {
        return { field };
      }
    }
  } catch (error) {
    console.error('Error parsing drag data:', error);
  }
  return { field: null };
};

