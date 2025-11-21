import { v4 as uuidv4 } from 'uuid';
import { Field } from '../types';

/**
 * Constants for synthetic field names
 */
export const MEASURE_NAMES_FIELD = 'MeasureNames';
export const MEASURE_VALUES_FIELD = 'MeasureValues';

/**
 * Check if a field is synthetic (MeasureNames or MeasureValues)
 */
export function isSyntheticField(field: Field): boolean {
  return field.isSynthetic === true;
}

/**
 * Check if a field is MeasureNames
 */
export function isMeasureNamesField(field: Field): boolean {
  return field.syntheticType === 'MeasureNames';
}

/**
 * Check if a field is MeasureValues
 */
export function isMeasureValuesField(field: Field): boolean {
  return field.syntheticType === 'MeasureValues';
}

/**
 * Check if synthetic fields can be generated (i.e., if there are any measures in the dataset)
 */
export function canGenerateSyntheticFields(availableFields: Field[]): boolean {
  return availableFields.some(field => field.type === 'measure' && !field.isSynthetic);
}

/**
 * Get all actual measure fields (excluding synthetic MeasureValues)
 * Optionally filter by measure names if a filter is provided
 */
export function getMeasureFieldsForUnpivot(
  availableFields: Field[],
  measureNamesFilter?: string[]
): Field[] {
  const measures = availableFields.filter(
    field => field.type === 'measure' && !field.isSynthetic
  );

  if (measureNamesFilter && measureNamesFilter.length > 0) {
    return measures.filter(measure => measureNamesFilter.includes(measure.columnName));
  }

  return measures;
}

/**
 * Generate synthetic MeasureNames and MeasureValues fields
 * Returns an array with both fields if measures exist, otherwise empty array
 */
export function generateSyntheticFields(availableFields: Field[]): Field[] {
  if (!canGenerateSyntheticFields(availableFields)) {
    return [];
  }

  const syntheticFields: Field[] = [];

  // Create MeasureNames field (discrete dimension)
  const measureNamesField: Field = {
    id: uuidv4(),
    columnName: MEASURE_NAMES_FIELD,
    type: 'dimension',
    flavour: 'discrete',
    dataType: 'string',
    isSynthetic: true,
    syntheticType: 'MeasureNames',
    isTypeChangeable: false,
    isFlavourChangeable: false,
  };

  // Create MeasureValues field (continuous measure)
  const measureValuesField: Field = {
    id: uuidv4(),
    columnName: MEASURE_VALUES_FIELD,
    type: 'measure',
    flavour: 'continuous',
    dataType: 'float',
    aggregation: 'sum', // Default aggregation
    isSynthetic: true,
    syntheticType: 'MeasureValues',
    isTypeChangeable: false,
    isFlavourChangeable: false,
  };

  syntheticFields.push(measureNamesField, measureValuesField);

  return syntheticFields;
}

/**
 * Get the names of all measures (for use in MeasureNames dimension values)
 */
export function getMeasureNames(availableFields: Field[]): string[] {
  return availableFields
    .filter(field => field.type === 'measure' && !field.isSynthetic)
    .map(field => field.columnName);
}

/**
 * Check if any field in the array uses synthetic fields
 */
export function hasSyntheticFieldUsage(fields: Field[]): boolean {
  return fields.some(field => field.isSynthetic === true);
}

