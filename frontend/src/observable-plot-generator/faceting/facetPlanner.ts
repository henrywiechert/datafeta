import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';
import { ChartGenerationContext } from '../types';
import { uniqueValuesForField } from './facetUtils';

export interface FacetPlan {
  rowFacetFields: Field[];
  colFacetFields: Field[];
  categoryAxis: 'x' | 'y' | null;
  categoryField: Field | null;
  barOrientation: 'barX' | 'barY' | null;
  sharedCategoryDomain: any[] | null;
}

/**
 * Analyzes the fields to determine faceting strategy.
 * @returns A FacetPlan if faceting should be applied, otherwise null.
 */
export function planFacets(context: ChartGenerationContext): FacetPlan | null {
  const { xFields, yFields, queryResult } = context;

  // Multi-measure on a single axis:
  // - If a discrete dimension exists on the SAME axis, facet by that dimension (duplicate the whole small charts)
  // - Otherwise, bypass faceting so the multi-measure bar grid can render
  const xMeasuresCount = xFields.filter((f) => f.type === 'measure').length;
  const yMeasuresCount = yFields.filter((f) => f.type === 'measure').length;
  const totalMeasures = xMeasuresCount + yMeasuresCount;
  const hasMixedAxes = xMeasuresCount > 0 && yMeasuresCount > 0;
  if (totalMeasures > 1 && !hasMixedAxes) {
    const measuresOnX = xMeasuresCount > 0;
    const sameAxisDiscreteDims = (measuresOnX ? xFields : yFields).filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
    // Prefer using the opposite-axis discrete dimension as a category axis when available,
    // even if same-axis discrete fields exist. This keeps bar spacing consistent across facets.
    const oppositeAxisDiscreteDims = (measuresOnX ? yFields : xFields).filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
    
    // Check if opposite axis has continuous dimensions - if so, we want line charts, not bars
    const oppositeAxisContinuousDims = (measuresOnX ? yFields : xFields).filter((f) => f.type === 'dimension' && f.flavour === 'continuous');
    
    // If opposite axis has BOTH discrete and continuous dimensions:
    // - Facet by discrete dimension(s)
    // - Each facet shows a line chart grid with continuous dimension × measures
    if (oppositeAxisDiscreteDims.length > 0 && oppositeAxisContinuousDims.length > 0) {
      // X discrete dimensions → column facets, Y discrete dimensions → row facets
      const xDiscDims = xFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
      const yDiscDims = yFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
      
      return {
        rowFacetFields: yDiscDims,
        colFacetFields: xDiscDims,
        categoryAxis: null,  // No category axis - we want line charts
        categoryField: null,
        barOrientation: null,  // No bar orientation - line charts
        sharedCategoryDomain: null,
      };
    }
    
    if (oppositeAxisDiscreteDims.length > 0 && oppositeAxisContinuousDims.length === 0) {
      const categoryField = oppositeAxisDiscreteDims[oppositeAxisDiscreteDims.length - 1];
      const categoryAxis: 'x' | 'y' = measuresOnX ? 'y' : 'x';
      const barOrientation: 'barX' | 'barY' = measuresOnX ? 'barX' : 'barY';
      const sharedCategoryDomain = uniqueValuesForField(queryResult.rows, categoryField);
      return {
        // Facet by remaining discrete fields from both axes except the chosen category
        rowFacetFields: yFields.filter((f) => f.flavour === 'discrete' && f.id !== categoryField.id),
        colFacetFields: xFields.filter((f) => f.flavour === 'discrete' && f.id !== categoryField.id),
        categoryAxis,
        categoryField,
        barOrientation,
        sharedCategoryDomain,
      };
    }
    if (sameAxisDiscreteDims.length > 0) {
      // Fallback: facet by the same-axis discrete dimensions; do not set a category axis
      return {
        rowFacetFields: measuresOnX ? [] : sameAxisDiscreteDims,
        colFacetFields: measuresOnX ? sameAxisDiscreteDims : [],
        categoryAxis: null,
        categoryField: null,
        barOrientation: measuresOnX ? 'barX' : 'barY',
        sharedCategoryDomain: null,
      };
    }
    // No discrete dimensions at all → fall back to non-faceted multi-measure chart
    return null;
  }

  // Handle tick-strip scenarios (continuous dimension on one axis with discrete dimensions):
  // General principle: Use the last discrete dimension from the opposite axis as category,
  // and all other discrete dimensions (from both axes) become facets.
  const hasAnyMeasure = xFields.some((f) => f.type === 'measure') || yFields.some((f) => f.type === 'measure');
  if (!hasAnyMeasure) {
    const xContDims = xFields.filter((f) => f.type === 'dimension' && f.flavour === 'continuous');
    const yContDims = yFields.filter((f) => f.type === 'dimension' && f.flavour === 'continuous');
    const xDiscDims = xFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
    const yDiscDims = yFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');

    // Tick-strip: one axis has continuous dimension, the other may have discrete dimensions
    const xTickScenario = xContDims.length === 1 && yContDims.length === 0;
    const yTickScenario = yContDims.length === 1 && xContDims.length === 0;
    
    if (xTickScenario || yTickScenario) {
      const sameAxisDiscreteDims = xTickScenario ? xDiscDims : yDiscDims;
      const oppositeAxisDiscreteDims = xTickScenario ? yDiscDims : xDiscDims;
      const totalDiscreteDims = sameAxisDiscreteDims.length + oppositeAxisDiscreteDims.length;
      
      // If there's more than one discrete dimension total, we need faceting
      if (totalDiscreteDims > 1) {
        // Prefer the last discrete dimension from opposite axis as category
        const categoryField = oppositeAxisDiscreteDims.length > 0
          ? oppositeAxisDiscreteDims[oppositeAxisDiscreteDims.length - 1]
          : null;
        const categoryAxis = xTickScenario ? 'y' : 'x';
        
        // All other discrete dimensions become facets
        const allDiscreteDims = [...xDiscDims, ...yDiscDims];
        const facetDims = categoryField 
          ? allDiscreteDims.filter((f) => f.id !== categoryField.id)
          : allDiscreteDims;
        
        return {
          rowFacetFields: yFields.filter((f) => facetDims.some((fd) => fd.id === f.id)),
          colFacetFields: xFields.filter((f) => facetDims.some((fd) => fd.id === f.id)),
          categoryAxis: categoryField ? categoryAxis : null,
          categoryField: categoryField,
          barOrientation: null, // tick-strip, not bar
          sharedCategoryDomain: categoryField ? uniqueValuesForField(queryResult.rows, categoryField) : null,
        };
      }
      
      // Single discrete dimension: let single-chart rules handle it
      // (simple tick-strip with category, no faceting needed)
      return null;
    }
  }

  // Determine if this is a bar chart scenario to identify a potential category axis
  const xMeasure = xFields.find((f) => f.type === 'measure');
  const yMeasure = yFields.find((f) => f.type === 'measure');
  let barOrientation: 'barX' | 'barY' | null = xMeasure && !yMeasure ? 'barX' : (!xMeasure && yMeasure ? 'barY' : null);
  let categoryAxis: 'x' | 'y' | null = barOrientation === 'barX' ? 'y' : (barOrientation === 'barY' ? 'x' : null);

  // If the opposite axis contains a continuous dimension, do NOT force bar orientation/category axis.
  // Example: X has a continuous dimension, Y has a measure + discrete dims → prefer line/scatter per facet, not bars.
  const hasXContinuousDim = xFields.some((f) => f.type === 'dimension' && f.flavour === 'continuous');
  const hasYContinuousDim = yFields.some((f) => f.type === 'dimension' && f.flavour === 'continuous');
  
  if ((barOrientation === 'barY' && hasXContinuousDim) || (barOrientation === 'barX' && hasYContinuousDim)) {
    barOrientation = null;
    categoryAxis = null;
  }

  let categoryField: Field | null = null;
  let sharedCategoryDomain: any[] | null = null;

  if (categoryAxis) {
    const axisFields = categoryAxis === 'x' ? xFields : yFields;
    const lastDiscrete = [...axisFields].filter((f) => f.flavour === 'discrete').slice(-1)[0];
    if (lastDiscrete) {
      categoryField = lastDiscrete;
      sharedCategoryDomain = uniqueValuesForField(queryResult.rows, lastDiscrete);
    } else {
      // Fallback single category when none present
      sharedCategoryDomain = [' '];
    }
  }

  const categoryFieldId = categoryField?.id;

  // All discrete fields not used for the category axis are used for faceting.
  const rowFacetFields = yFields.filter((f) => f.flavour === 'discrete' && f.id !== categoryFieldId);
  const colFacetFields = xFields.filter((f) => f.flavour === 'discrete' && f.id !== categoryFieldId);

  return {
    rowFacetFields,
    colFacetFields,
    categoryAxis,
    categoryField,
    barOrientation,
    sharedCategoryDomain,
  };
}

