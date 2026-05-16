// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../../types';
import { getAvailableAggregations, getFieldDisplayName } from '../../../utils/fieldUtils';

// Get available aggregations for a field
export const getFieldAggregations = (field: Field) => {
  return getAvailableAggregations(field);
};

// Check if a field can be continuous
export const canBeContinuous = (field: Field): boolean => {
  // Only dimensions of type string cannot be continuous
  // Measures of type string can be continuous
  if (field.dataType === 'string' && field.type === 'dimension') {
    return false;
  }
  return true; // All other combinations can be continuous
};

// Check if a field can be a measure
export const canBeMeasure = (field: Field): boolean => {
  return true;
};

// Format the full label for a field
export const formatFullLabel = (field: Field): string => {
  return `${getFieldDisplayName(field)}${field.aggregation ? `(${field.aggregation})` : ''} [${field.flavour}] (${field.dataType})`;
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

  // When datetime field becomes a measure, set appropriate default aggregation
  if (newField.dataType === 'datetime' && updates.type === 'measure' && field.type === 'dimension') {
    // Default to 'max' for datetime measures (latest timestamp)
    newField.aggregation = 'max';
  }

  // If changing to string data type, force flavour to discrete
  if (updates.dataType === 'string') {
    newField.flavour = 'discrete';
  }

  // Only string dimensions cannot be continuous, string measures can be
  if (newField.dataType === 'string' && newField.type === 'dimension' && updates.flavour === 'continuous') {
    newField.flavour = 'discrete'; // Force it to remain discrete
  }

  // Datetime fields default to dimension, but can be changed to measure
  // (No forced conversion - allow user to choose)

  // When changing from datetime to non-datetime dataType, clear datetime part info
  if (updates.dataType !== undefined && updates.dataType !== 'datetime') {
    delete newField.dateTimePart;
    delete newField.dateTimeMode;
  }

  // When setting a datetime part or mode
  if (updates.dateTimePart !== undefined || updates.dateTimeMode !== undefined) {
    // If clearing both datetime part and mode, and BOTH are undefined in updates
    if (updates.dateTimePart === undefined && updates.dateTimeMode === undefined) {
      delete newField.dateTimePart;
      delete newField.dateTimeMode;
    }
    // Otherwise, keep what's being set
    // This allows Full DateTime (no part, but has mode='timeline')
  }

  // When a datetime part is selected, ensure field is a dimension
  if (newField.dateTimePart && newField.dateTimeMode) {
    newField.type = 'dimension';
    delete newField.aggregation;
  }

  return newField;
};
