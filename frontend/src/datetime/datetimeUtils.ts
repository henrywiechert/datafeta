/**
 * DateTime Utility Functions
 * 
 * Centralized utilities for datetime field handling in the frontend.
 * Handles datetime parts, modes, display names, and validation.
 */

import { DateTimePart, DateTimeMode, Field } from '../types';
// Re-export from datetimeSemantics for backward compatibility
// Note: DATETIME_PARTS and DATETIME_MODES are defined in datetimeSemantics.ts
import { DATETIME_PARTS, DATETIME_MODES } from './datetimeSemantics';
export { DATETIME_PARTS, DATETIME_MODES };

/**
 * Check if a field is a datetime field
 */
export function isDateTimeField(field: Field): boolean {
  return field.dataType === 'datetime';
}

/**
 * Check if a field has a datetime part configured
 */
export function hasDateTimePart(field: Field): boolean {
  return Boolean(field.dateTimePart && field.dateTimeMode);
}

/**
 * Get the display name for a datetime part
 */
export function getDateTimePartDisplayName(part: DateTimePart): string {
  return part.charAt(0).toUpperCase() + part.slice(1);
}

/**
 * Get the display name for a field including datetime part information.
 * 
 * @param field The field to get display name for
 * @param aliasLookup Optional map from columnName to display alias. If provided, this takes
 *                    precedence over field.displayAlias for looking up aliases.
 */
export function getFieldDisplayNameWithDateTime(field: Field, aliasLookup?: Record<string, string>): string {
  // Look up alias: first from aliasLookup map (if provided), then from field.displayAlias, finally use columnName
  const baseName = aliasLookup?.[field.columnName] ?? field.displayAlias ?? field.columnName;
  
  if (field.dateTimePart && field.dateTimeMode) {
    const partName = getDateTimePartDisplayName(field.dateTimePart);
    const modeName = field.dateTimeMode === 'distinct' ? 'distinct' : 'timeline';
    return `${baseName} - ${partName} (${modeName})`;
  }
  
  return baseName;
}

/**
 * Get a tooltip description for a field's datetime part configuration
 */
export function getDateTimePartTooltip(field: Field): string | undefined {
  if (!field.dateTimePart || !field.dateTimeMode) {
    return undefined;
  }
  
  const partName = getDateTimePartDisplayName(field.dateTimePart);
  
  if (field.dateTimeMode === 'distinct') {
    return `${partName} values only (e.g., 12 months: Jan, Feb, ..., Dec)`;
  } else {
    return `${partName} timeline bins (e.g., date_trunc to ${partName.toLowerCase()} → timestamps across the dataset)`;
  }
}

/**
 * Get the column name for a field as it appears in query results.
 * DateTime parts get a special alias: fieldname_part_mode
 */
export function getResultColumnNameForDateTime(field: Field): string {
  if (field.type === 'measure' && field.aggregation) {
    return `${field.aggregation.toUpperCase()}(${field.columnName})`;
  }
  
  // If this is a datetime part, return the special alias
  if (field.dateTimePart && field.dateTimeMode) {
    return `${field.columnName}_${field.dateTimePart}_${field.dateTimeMode}`;
  }
  
  return field.columnName;
}

/**
 * Validate datetime part and mode combination
 */
export function isValidDateTimeConfiguration(
  part?: DateTimePart,
  mode?: DateTimeMode
): boolean {
  if (!part && !mode) {
    return true; // No datetime configuration is valid
  }
  
  if (!part || !mode) {
    return false; // Both must be set together
  }
  
  return DATETIME_PARTS.includes(part) && DATETIME_MODES.includes(mode);
}

/**
 * Clear datetime part configuration from a field
 */
export function clearDateTimePart(field: Field): Partial<Field> {
  return {
    dateTimePart: undefined,
    dateTimeMode: undefined,
  };
}

/**
 * Set datetime part configuration on a field
 */
export function setDateTimePart(
  field: Field,
  part: DateTimePart,
  mode: DateTimeMode
): Partial<Field> {
  return {
    dateTimePart: part,
    dateTimeMode: mode,
  };
}

/**
 * Check if a field can have datetime parts applied
 * (must be a datetime field)
 */
export function canHaveDateTimePart(field: Field): boolean {
  return field.dataType === 'datetime';
}

/**
 * Get a human-readable description of a datetime mode
 */
export function getDateTimeModeDescription(mode: DateTimeMode): string {
  switch (mode) {
    case 'distinct':
      return 'Distinct values only (aggregated across time)';
    case 'timeline':
      return 'Timeline view (preserves temporal sequence)';
    default:
      return mode;
  }
}

/**
 * Format a date string for display (simplified)
 */
export function formatDateForDisplay(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

/**
 * Extract date part from ISO datetime string (YYYY-MM-DD from YYYY-MM-DDTHH:mm:ss)
 */
export function extractDatePart(isoDateString: string): string {
  return isoDateString.split('T')[0];
}

/**
 * Check if two datetime configurations are equal
 */
export function areDateTimeConfigsEqual(
  field1: Field,
  field2: Field
): boolean {
  return (
    field1.dateTimePart === field2.dateTimePart &&
    field1.dateTimeMode === field2.dateTimeMode
  );
}
