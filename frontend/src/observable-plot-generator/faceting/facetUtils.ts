import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';

/**
 * Filter rows by multiple facet field values (hierarchical faceting).
 * This is the primary filtering function used in faceted grid generation.
 */
export function filterRowsByFacets(
  rows: any[],
  rowFields: Field[],
  rowValues: any[],
  colFields: Field[],
  colValues: any[]
): any[] {
  return rows.filter((row) => {
    for (let i = 0; i < rowFields.length; i++) {
      const f = rowFields[i];
      const v = rowValues[i];
      const col = getFieldColumnName(f);
      if (v !== undefined && row[col] !== v) return false;
    }
    for (let j = 0; j < colFields.length; j++) {
      const f = colFields[j];
      const v = colValues[j];
      const col = getFieldColumnName(f);
      if (v !== undefined && row[col] !== v) return false;
    }
    return true;
  });
}

export function buildFacetCombos(fields: Field[], valuesLevels: any[][]): any[][] {
  if (fields.length === 0) return [];
  const result: any[][] = [];
  const helper = (level: number, acc: any[]) => {
    if (level === fields.length) {
      result.push(acc.slice());
      return;
    }
    const vals = valuesLevels[level] || [];
    for (let i = 0; i < vals.length; i++) {
      acc.push(vals[i]);
      helper(level + 1, acc);
      acc.pop();
    }
  };
  helper(0, []);
  return result;
}

/**
 * Returns a sorted list of unique values for a given field from the dataset.
 * Moved from facetPlanner.ts to consolidate utilities.
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
  // Smart sorting: if all values are numeric, sort numerically; otherwise sort as strings
  try {
    const allNumeric = values.every(v => typeof v === 'number' && !Number.isNaN(v));
    if (allNumeric) {
      values.sort((a, b) => a - b);
    } else {
      values.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
    }
  } catch (e) {
    // ignore sort errors for complex types
  }
  return values;
}
