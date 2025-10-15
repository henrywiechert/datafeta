import { Field } from '../../types';
import { ChartGenerationContext } from '../types';

/**
 * Simplified facet plan - only specifies which fields create facets.
 * Chart-type-specific logic (bar orientation, category axis) is handled by the generator.
 */
export interface FacetPlan {
  rowFacetFields: Field[];
  colFacetFields: Field[];
}

/**
 * Analyzes the fields to determine which discrete dimensions should become facets.
 * 
 * Core principle: Discrete dimensions can either be:
 * 1. Facets (create multiple small charts arranged in a grid)
 * 2. Chart encodings (category axis, color, etc.) - handled by the generator
 * 
 * This function determines ONLY faceting, leaving chart-type decisions to the generator.
 * 
 * @returns A FacetPlan if faceting should be applied, otherwise null.
 */
export function planFacets(context: ChartGenerationContext): FacetPlan | null {
  const { xFields, yFields } = context;

  // Get all discrete dimensions
  const xDiscrete = xFields.filter((f) => f.flavour === 'discrete');
  const yDiscrete = yFields.filter((f) => f.flavour === 'discrete');
  
  // No discrete dimensions → no faceting
  if (xDiscrete.length === 0 && yDiscrete.length === 0) {
    return null;
  }

  // Strategy: Use discrete dimensions as facets, except possibly one for category encoding
  // The generator will decide if one should be reserved for category axis
  
  // Simple rule: X discrete → column facets, Y discrete → row facets
  // The generator can adjust this by removing one field for category encoding if needed
  const rowFacetFields = yDiscrete;
  const colFacetFields = xDiscrete;

  // Only return a plan if there are actually fields to facet
  // (The generator will decide if some should be used for encoding instead)
  if (rowFacetFields.length === 0 && colFacetFields.length === 0) {
    return null;
  }

  return {
    rowFacetFields,
    colFacetFields,
  };
}

