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