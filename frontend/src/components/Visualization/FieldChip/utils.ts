import { Field } from '../../../types';
import { getAvailableAggregations } from '../../../utils/fieldUtils';

// Get available aggregations for a field
export const getFieldAggregations = (field: Field) => {
  return getAvailableAggregations(field);
};

// Check if a field can be continuous
export const canBeContinuous = (field: Field): boolean => {
  return field.dataType !== 'string'; // String fields can only be discrete
};

// Check if a field can be a measure
export const canBeMeasure = (field: Field): boolean => {
  return true;
};

// Format the full label for a field
export const formatFullLabel = (field: Field): string => {
  return `${field.columnName}${field.aggregation ? `(${field.aggregation})` : ''} [${field.flavour}] (${field.dataType})`;
};

// Apply field update rules
export const applyFieldUpdateRules = (field: Field, updates: Partial<Field>): Field | null => {
  const newField = { ...field, ...updates };

  if (updates.type === 'dimension') {
    delete newField.aggregation;
  } else if (updates.type === 'measure' && field.type === 'dimension') {
    // If changing from dimension to measure, set a default aggregation based on flavour
    if (field.flavour === 'continuous') {
      newField.aggregation = 'sum';
    } else { // for 'discrete' fields
      newField.aggregation = 'count';
    }
  }

  // Ensure flavour has a default value if not set
  if (!newField.flavour) {
    newField.flavour = 'discrete';
  }

  // Enforce constraint: string fields can only be discrete
  if (newField.dataType === 'string' && updates.flavour === 'continuous') {
    // Don't allow the change, keep it discrete
    return null;
  }

  // Enforce constraint: datetime fields can only be measures
  if (newField.dataType === 'datetime' && updates.type === 'measure') {
    // Don't allow the change, keep it as dimension
    return null;
  }

  // If changing to string data type, force flavour to discrete
  if (updates.dataType === 'string') {
    newField.flavour = 'discrete';
  }

  // If changing to datetime data type, force type to dimension
  if (updates.dataType === 'datetime') {
    newField.type = 'dimension';
    delete newField.aggregation; // Remove any aggregation since it's now a dimension
  }

  return newField;
};
