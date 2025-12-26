import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';

/**
 * Compare two values for equality, handling Date objects by timestamp.
 */
function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  // Compare Date objects by timestamp value, not reference
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return false;
}

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
      if (v !== undefined && !valuesEqual(row[col], v)) return false;
    }
    for (let j = 0; j < colFields.length; j++) {
      const f = colFields[j];
      const v = colValues[j];
      const col = getFieldColumnName(f);
      if (v !== undefined && !valuesEqual(row[col], v)) return false;
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
  // Use Map with key function to handle Date objects correctly
  // (Dates need to be compared by timestamp value, not by reference)
  const seen = new Map<string | number, any>();
  const values: any[] = [];
  rows.forEach((row) => {
    const v = row[col];
    // For Date objects, use timestamp as key; for others, use the value itself
    const key = v instanceof Date ? v.getTime() : v;
    if (!seen.has(key)) {
      seen.set(key, v);
      values.push(v);
    }
  });
  // Sort for consistency, especially important for facet ordering
  // Smart sorting: dates by timestamp, numbers numerically, others as strings
  try {
    const allDates = values.every(v => v instanceof Date);
    const allNumeric = values.every(v => typeof v === 'number' && !Number.isNaN(v));
    if (allDates) {
      values.sort((a, b) => a.getTime() - b.getTime());
    } else if (allNumeric) {
      values.sort((a, b) => a - b);
    } else {
      values.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
    }
  } catch (e) {
    // ignore sort errors for complex types
  }
  return values;
}
