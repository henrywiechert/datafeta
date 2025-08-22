import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';
import { ChartGenerationContext } from '../types';

export interface FacetPlan {
  rowFacetFields: Field[];
  colFacetFields: Field[];
  categoryAxis: 'x' | 'y' | null;
  categoryField: Field | null;
  barOrientation: 'barX' | 'barY' | null;
  sharedCategoryDomain: any[] | null;
}

/**
 * Returns a sorted list of unique values for a given field from the dataset.
 */
export function uniqueValuesForField(rows: any[], field: Field): any[] {
  const col = getFieldColumnName(field);
  const seen = new Set<any>();
  const values: any[] = [];
  rows.forEach((row) => {
    const v = row[col];
    if (!seen.has(v)) {
      seen.add(v);
      values.push(v);
    }
  });
  // Sort for consistency, especially important for facet ordering
  try {
    values.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
  } catch (e) {
    // ignore sort errors for complex types
  }
  return values;
}


/**
 * Analyzes the fields to determine faceting strategy.
 * @returns A FacetPlan if faceting should be applied, otherwise null.
 */
export function planFacets(context: ChartGenerationContext): FacetPlan | null {
  const { xFields, yFields, queryResult } = context;

  // Avoid faceting for tick-strip scenarios:
  // If there are no measures and exactly one axis has a continuous dimension
  // while the opposite axis has only discrete dimensions, we want a single
  // tick-strip with categories (not a faceted grid).
  const hasAnyMeasure = xFields.some((f) => f.type === 'measure') || yFields.some((f) => f.type === 'measure');
  if (!hasAnyMeasure) {
    const xContDims = xFields.filter((f) => f.type === 'dimension' && f.flavour === 'continuous');
    const yContDims = yFields.filter((f) => f.type === 'dimension' && f.flavour === 'continuous');
    const xDiscDims = xFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
    const yDiscDims = yFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');

    const xTickScenario = xContDims.length === 1 && yContDims.length === 0 && yDiscDims.length > 0;
    const yTickScenario = yContDims.length === 1 && xContDims.length === 0 && xDiscDims.length > 0;
    if (xTickScenario || yTickScenario) {
      return null; // let single-chart rules build tick-strip with category
    }
  }

  // Determine if this is a bar chart scenario to identify a potential category axis
  const xMeasure = xFields.find((f) => f.type === 'measure');
  const yMeasure = yFields.find((f) => f.type === 'measure');
  const barOrientation: 'barX' | 'barY' | null = xMeasure && !yMeasure ? 'barX' : (!xMeasure && yMeasure ? 'barY' : null);
  const categoryAxis: 'x' | 'y' | null = barOrientation === 'barX' ? 'y' : (barOrientation === 'barY' ? 'x' : null);

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

