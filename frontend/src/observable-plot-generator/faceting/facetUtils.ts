// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';

function parseNumericCategory(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Result of bar/tick strip detection.
 * Used by both facet generation and validation.
 */
export interface BarChartDetectionResult {
  /** Whether this is a bar or tick strip chart */
  isBarOrTickStrip: boolean;
  /** Bar orientation: barX (horizontal) or barY (vertical) */
  barOrientation: 'barX' | 'barY' | null;
  /** Which axis has the categories (opposite to bar direction) */
  categoryAxis: 'x' | 'y' | null;
  /** The field used for categories on the category axis, if any */
  categoryField: Field | null;
}

/**
 * Detect if the field configuration represents a bar chart or tick strip.
 * 
 * Bar/tick strip detection logic:
 * - One axis has measure(s) or continuous dimension(s)
 * - Other axis has discrete dimension(s) for categories
 * 
 * This is shared between facetGenerator and facetValidation to ensure
 * consistent behavior when determining which field is used for categories
 * vs which are used for faceting.
 */
export function detectBarChartConfiguration(
  xFields: Field[],
  yFields: Field[]
): BarChartDetectionResult {
  // Check if this is a bar/tick strip scenario
  const xMeasure = xFields.find((f) => f.type === 'measure');
  const yMeasure = yFields.find((f) => f.type === 'measure');
  const xContinuousDim = xFields.find((f) => f.type === 'dimension' && f.flavour === 'continuous');
  const yContinuousDim = yFields.find((f) => f.type === 'dimension' && f.flavour === 'continuous');

  // Detect bar/tick strip orientation: continuous field on one axis, discrete on other
  let barOrientation: 'barX' | 'barY' | null = null;
  if ((xMeasure || xContinuousDim) && !yMeasure && !yContinuousDim) {
    barOrientation = 'barX';
  } else if ((yMeasure || yContinuousDim) && !xMeasure && !xContinuousDim) {
    barOrientation = 'barY';
  }

  if (!barOrientation) {
    return {
      isBarOrTickStrip: false,
      barOrientation: null,
      categoryAxis: null,
      categoryField: null,
    };
  }

  // Category axis is opposite to bar orientation
  const categoryAxis = barOrientation === 'barX' ? 'y' : 'x';
  const axisFields = categoryAxis === 'x' ? xFields : yFields;
  const discreteFields = axisFields.filter((f) => f.flavour === 'discrete');

  // The last discrete field on the category axis is used for categories
  const categoryField = discreteFields.length > 0
    ? discreteFields[discreteFields.length - 1]
    : null;

  return {
    isBarOrTickStrip: true,
    barOrientation,
    categoryAxis,
    categoryField,
  };
}

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
 * Counts unique values for a field without sorting or materializing the values.
 */
export function countUniqueValuesForField(rows: any[], field: Field): number {
  const col = getFieldColumnName(field);
  const seen = new Set<string | number>();
  rows.forEach((row) => {
    const v = row[col];
    const key = v instanceof Date ? v.getTime() : v;
    seen.add(key);
  });
  return seen.size;
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
    const allNumeric = values.every(v => parseNumericCategory(v) !== null);
    if (allDates) {
      values.sort((a, b) => a.getTime() - b.getTime());
    } else if (allNumeric) {
      values.sort((a, b) => (parseNumericCategory(a) ?? 0) - (parseNumericCategory(b) ?? 0));
    } else {
      values.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
    }
  } catch (e) {
    // ignore sort errors for complex types
  }
  return values;
}
