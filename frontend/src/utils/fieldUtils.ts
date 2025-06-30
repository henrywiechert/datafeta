import { Field, Aggregation } from '../types';

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

  if (field.flavour === 'discrete') {
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
 * @param field The field.
 * @returns The name to look for in the query result columns.
 */
export function getResultColumnName(field: Field): string {
  if (field.type === 'measure' && field.aggregation) {
    return `${field.aggregation.toUpperCase()}(${field.columnName})`;
  }
  return field.columnName;
} 