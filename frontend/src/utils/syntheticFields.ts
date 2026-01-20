import { v4 as uuidv4 } from 'uuid';
import { Field, FieldOverrideState } from '../types';

/**
 * Constants for synthetic field names
 */
export const MEASURE_NAMES_FIELD = 'MeasureNames';
export const MEASURE_VALUES_FIELD = 'MeasureValues';
export const DEFAULT_MEASURE_GROUP_ID = '__all_measures__';

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
  measureNames?: string[]
): Field[] {
  const measures = availableFields.filter(
    field => field.type === 'measure' && !field.isSynthetic
  );

  if (measureNames) {
    return measures.filter(measure => measureNames.includes(measure.columnName));
  }

  return measures;
}

/**
 * Generate synthetic MeasureNames and MeasureValues fields
 * Returns an array with both fields if measures exist, otherwise empty array
 * When measureNames is empty or undefined, generates synthetic fields using ALL measures
 */
export function generateSyntheticFieldsForGroup(
  baseFields: Field[],
  measureNames?: string[]
): Field[] {
  const hasMeasures = canGenerateSyntheticFields(baseFields);
  if (!hasMeasures) {
    return [];
  }

  // When no specific measures are provided, use ALL measures
  // This ensures MeasureNames/MeasureValues are always available in the field list
  const effectiveMeasureNames = (!measureNames || measureNames.length === 0)
    ? getMeasureNames(baseFields)
    : measureNames;

  if (effectiveMeasureNames.length === 0) {
    return [];
  }

  const syntheticGroupId = DEFAULT_MEASURE_GROUP_ID;
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
    syntheticGroupId,
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
    syntheticGroupId,
    isTypeChangeable: false,
    isFlavourChangeable: false,
  };

  syntheticFields.push(measureNamesField, measureValuesField);

  return syntheticFields;
}

// Backwards-compatible helper (uses all measures in a default group).
export function generateSyntheticFields(availableFields: Field[]): Field[] {
  const measureNames = getMeasureNames(availableFields);
  return generateSyntheticFieldsForGroup(availableFields, measureNames);
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

/**
 * Build a mapping from MeasureNames string values to their field overrides.
 * This allows chart generators to apply per-measure colors/styles when rendering unpivoted data.
 * 
 * @param measureValuesSourceFields - Source measures contributing to MeasureValues
 * @param fieldOverrides - Per-field overrides keyed by field ID
 * @returns Map from measure column name (string) to its override
 */
export function buildMeasureNamesOverrideMap(
  measureValuesSourceFields: Field[],
  fieldOverrides: Record<string, FieldOverrideState>
): Map<string, FieldOverrideState> {
  const overrideMap = new Map<string, FieldOverrideState>();
  
  for (const sourceField of measureValuesSourceFields) {
    const override = fieldOverrides[sourceField.id];
    if (override) {
      // Map the measure's column name (which will appear in MeasureNames column) to its override
      overrideMap.set(sourceField.columnName, override);
    }
  }
  
  return overrideMap;
}

/**
 * Get the color override for a specific MeasureNames value.
 * Returns undefined if no override is set.
 * 
 * @param measureName - The MeasureNames value (e.g., "Revenue")
 * @param overrideMap - Map built by buildMeasureNamesOverrideMap
 * @returns The manual color override, or undefined
 */
export function getMeasureNameColor(
  measureName: string,
  overrideMap: Map<string, FieldOverrideState>
): string | undefined {
  const override = overrideMap.get(measureName);
  return override?.manualColor;
}

/**
 * Build an explicit color mapping from MeasureNames values to colors.
 * This creates a domain/range pair for Observable Plot categorical color scales.
 * 
 * @param measureValuesSourceFields - Source measures contributing to MeasureValues
 * @param fieldOverrides - Per-field overrides keyed by field ID
 * @returns Object with domain (measure names) and range (colors), or null if no overrides
 */
export function buildMeasureNamesColorScale(
  measureValuesSourceFields: Field[],
  fieldOverrides: Record<string, FieldOverrideState>
): { domain: string[]; range: string[] } | null {
  const domain: string[] = [];
  const range: string[] = [];
  let hasOverrides = false;
  
  for (const sourceField of measureValuesSourceFields) {
    domain.push(sourceField.columnName);
    const override = fieldOverrides[sourceField.id];
    if (override?.manualColor) {
      range.push(override.manualColor);
      hasOverrides = true;
    } else {
      // Push undefined placeholder - will use default scheme color
      range.push('');
    }
  }
  
  // Only return if at least one override was found
  return hasOverrides ? { domain, range } : null;
}

/**
 * Combine overrides from multiple source measures into a single effective override.
 * This is used when MeasureValues is on an axis and we need to apply overrides
 * to the combined chart.
 * 
 * Strategy:
 * - For numeric values (manualSize, colorBias): use the first defined value
 * - For arrays (sizeRange, labelFields): use the first defined value
 * - For objects (colorField, sizeField): use the first defined value
 * - For strings (colorScheme, manualColor, chartType): use the first defined value
 * 
 * @param measureValuesSourceFields - Source measures contributing to MeasureValues
 * @param fieldOverrides - Per-field overrides keyed by field ID
 * @returns Combined override, or undefined if no overrides exist
 */
export function combineMeasureValuesOverrides(
  measureValuesSourceFields: Field[] | undefined,
  fieldOverrides: Record<string, FieldOverrideState> | undefined
): FieldOverrideState | undefined {
  if (!measureValuesSourceFields?.length || !fieldOverrides) {
    return undefined;
  }

  // Collect all overrides from source measures
  const sourceOverrides: FieldOverrideState[] = [];
  for (const sourceField of measureValuesSourceFields) {
    const override = fieldOverrides[sourceField.id];
    if (override && Object.keys(override).length > 0) {
      sourceOverrides.push(override);
    }
  }

  if (sourceOverrides.length === 0) {
    return undefined;
  }

  // Combine overrides - use first defined value for each property
  const combined: FieldOverrideState = {};

  for (const override of sourceOverrides) {
    // Color properties
    if (combined.colorFieldId === undefined && override.colorFieldId !== undefined) {
      combined.colorFieldId = override.colorFieldId;
    }
    if (combined.colorField === undefined && override.colorField !== undefined) {
      combined.colorField = override.colorField;
    }
    if (combined.colorScheme === undefined && override.colorScheme !== undefined) {
      combined.colorScheme = override.colorScheme;
    }
    if (combined.colorBias === undefined && override.colorBias !== undefined) {
      combined.colorBias = override.colorBias;
    }
    if (combined.manualColor === undefined && override.manualColor !== undefined) {
      combined.manualColor = override.manualColor;
    }

    // Size properties
    if (combined.sizeFieldId === undefined && override.sizeFieldId !== undefined) {
      combined.sizeFieldId = override.sizeFieldId;
    }
    if (combined.sizeField === undefined && override.sizeField !== undefined) {
      combined.sizeField = override.sizeField;
    }
    if (combined.sizeRange === undefined && override.sizeRange !== undefined) {
      combined.sizeRange = override.sizeRange;
    }
    if (combined.manualSize === undefined && override.manualSize !== undefined) {
      combined.manualSize = override.manualSize;
    }

    // Label properties
    if (combined.displayLabel === undefined && override.displayLabel !== undefined) {
      combined.displayLabel = override.displayLabel;
    }
    if (combined.dataLabelMode === undefined && override.dataLabelMode !== undefined) {
      combined.dataLabelMode = override.dataLabelMode;
    }
    if (combined.labelFields === undefined && override.labelFields !== undefined) {
      combined.labelFields = override.labelFields;
    }

    // Chart type
    if (combined.chartType === undefined && override.chartType !== undefined) {
      combined.chartType = override.chartType;
    }
  }

  return Object.keys(combined).length > 0 ? combined : undefined;
}

