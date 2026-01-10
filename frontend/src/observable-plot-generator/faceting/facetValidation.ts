/**
 * Facet validation utilities.
 * 
 * Validates facet counts before rendering to prevent browser overwhelm
 * when too many facets would be created.
 */

import { Field } from '../../types';
import { ChartGenerationContext } from '../types';
import { FacetPlan } from './facetPlanner';
import { uniqueValuesForField } from './facetUtils';

/**
 * Maximum number of facets allowed in a single direction (rows or columns)
 * before showing a warning to the user.
 */
export const FACET_LIMIT = 500;

/**
 * Result of facet validation, including counts and which direction exceeds the limit.
 */
export interface FacetValidationResult {
  /** Whether the facet counts are within acceptable limits */
  isValid: boolean;
  /** Number of row facets (product of unique values across row facet fields) */
  rowFacetCount: number;
  /** Number of column facets (product of unique values across column facet fields) */
  colFacetCount: number;
  /** Fields contributing to row facets */
  rowFacetFields: Field[];
  /** Fields contributing to column facets */
  colFacetFields: Field[];
  /** Which direction exceeds the limit, if any */
  exceedsLimit: 'row' | 'col' | 'both' | null;
}

/**
 * Determines if a bar/tick strip category field should be excluded from faceting.
 * 
 * In bar/tick strip scenarios, one discrete dimension is used for the category axis
 * (e.g., the bars' categories) and should not count toward faceting.
 * 
 * This replicates the logic from facetGenerator.deriveChartConfig.
 */
function getCategoryFieldId(context: ChartGenerationContext): string | null {
  const { xFields, yFields } = context;

  // Check if this is a bar/tick strip scenario
  const xMeasure = xFields.find((f) => f.type === 'measure');
  const yMeasure = yFields.find((f) => f.type === 'measure');
  const xContinuousDim = xFields.find((f) => f.type === 'dimension' && f.flavour === 'continuous');
  const yContinuousDim = yFields.find((f) => f.type === 'dimension' && f.flavour === 'continuous');

  // Detect bar/tick strip orientation
  let barOrientation: 'barX' | 'barY' | null = null;
  if ((xMeasure || xContinuousDim) && !yMeasure && !yContinuousDim) {
    barOrientation = 'barX';
  } else if ((yMeasure || yContinuousDim) && !xMeasure && !xContinuousDim) {
    barOrientation = 'barY';
  }

  if (!barOrientation) {
    return null;
  }

  // Category axis is opposite to bar orientation
  const categoryAxis = barOrientation === 'barX' ? 'y' : 'x';
  const axisFields = categoryAxis === 'x' ? xFields : yFields;
  const discreteFields = axisFields.filter((f) => f.flavour === 'discrete');

  // The last discrete field on the category axis is used for categories
  if (discreteFields.length > 0) {
    return discreteFields[discreteFields.length - 1].id;
  }

  return null;
}

/**
 * Validates facet counts based on the query result data.
 * 
 * This should be called after the query returns but before chart generation,
 * using actual unique values from the result data (which respects filters).
 * 
 * @param context - The chart generation context with query results
 * @param plan - The facet plan specifying row and column facet fields
 * @returns Validation result with counts and limit status
 */
export function validateFacetCounts(
  context: ChartGenerationContext,
  plan: FacetPlan
): FacetValidationResult {
  const { queryResult } = context;
  const { rowFacetFields, colFacetFields } = plan;

  // Get the category field ID to exclude from facet counting
  const categoryFieldId = getCategoryFieldId(context);

  // Filter out the category field from faceting (it's used for bar categories, not facets)
  const effectiveRowFacetFields = rowFacetFields.filter((f) => f.id !== categoryFieldId);
  const effectiveColFacetFields = colFacetFields.filter((f) => f.id !== categoryFieldId);

  // Compute facet counts as the product of unique values across all facet fields in each direction
  // For multiple fields: field A with 10 values × field B with 5 values = 50 facets
  let rowFacetCount = 1;
  for (const field of effectiveRowFacetFields) {
    const uniqueValues = uniqueValuesForField(queryResult.rows, field);
    rowFacetCount *= uniqueValues.length;
  }
  // If no row facet fields, there's 1 implicit row (no faceting in that direction)
  if (effectiveRowFacetFields.length === 0) {
    rowFacetCount = 1;
  }

  let colFacetCount = 1;
  for (const field of effectiveColFacetFields) {
    const uniqueValues = uniqueValuesForField(queryResult.rows, field);
    colFacetCount *= uniqueValues.length;
  }
  // If no column facet fields, there's 1 implicit column (no faceting in that direction)
  if (effectiveColFacetFields.length === 0) {
    colFacetCount = 1;
  }

  // Determine which direction(s) exceed the limit
  const rowExceeds = rowFacetCount > FACET_LIMIT;
  const colExceeds = colFacetCount > FACET_LIMIT;
  
  let exceedsLimit: 'row' | 'col' | 'both' | null = null;
  if (rowExceeds && colExceeds) {
    exceedsLimit = 'both';
  } else if (rowExceeds) {
    exceedsLimit = 'row';
  } else if (colExceeds) {
    exceedsLimit = 'col';
  }

  return {
    isValid: exceedsLimit === null,
    rowFacetCount,
    colFacetCount,
    rowFacetFields: effectiveRowFacetFields,
    colFacetFields: effectiveColFacetFields,
    exceedsLimit,
  };
}
