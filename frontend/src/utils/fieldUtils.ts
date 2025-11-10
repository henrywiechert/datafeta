import { Field, Aggregation } from '../types';
import { 
  getResultColumnNameForDateTime,
  getFieldDisplayNameWithDateTime,
  getDateTimePartTooltip as getDateTimeTooltip 
} from './datetimeUtils';

const DISCRETE_AGGREGATIONS: Aggregation[] = ['min', 'max', 'count', 'count_distinct'];
const CONTINUOUS_AGGREGATIONS: Aggregation[] = ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'];

/**
 * Gets the list of valid aggregations for a given field based on its rules.
 * @param field The field to check.
 * @returns An array of valid aggregation types.
 */
export function getAvailableAggregations(field: Field): Aggregation[] {
  if (field.type === 'dimension') {
    return []; // Dimensions have no aggregations
  }

  // For measures, available aggregations depend on flavour and data type
  if (field.flavour === 'discrete') {
    // Numerical discrete measures can have continuous aggregations
    if (field.dataType === 'integer' || field.dataType === 'float') {
      return CONTINUOUS_AGGREGATIONS;
    }
    // Non-numerical discrete measures have limited aggregations
    return DISCRETE_AGGREGATIONS;
  }

  return CONTINUOUS_AGGREGATIONS;
}

export function isDimension(field: Field): boolean {
  return field.type === 'dimension';
}

export function isMeasure(field: Field): boolean {
  return field.type === 'measure';
}

/**
 * Gets the column name for a field as it would appear in a query result.
 * Dimensions use their column name directly, while measures use an alias.
 * DateTime parts get a special alias: fieldname_part_mode
 * @param field The field.
 * @returns The name to look for in the query result columns.
 */
export function getResultColumnName(field: Field): string {
  return getResultColumnNameForDateTime(field);
}

/**
 * Gets the display name for a field, including datetime part information if present.
 * @param field The field.
 * @returns A formatted display name.
 */
export function getFieldDisplayName(field: Field): string {
  return getFieldDisplayNameWithDateTime(field);
}

/**
 * Gets a tooltip description for a field's datetime part configuration.
 * @param field The field.
 * @returns A description string, or undefined if no datetime part.
 */
export function getDateTimePartTooltip(field: Field): string | undefined {
  return getDateTimeTooltip(field);
} 