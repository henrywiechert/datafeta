/**
 * Utility to convert our color scheme ID to Observable Plot color configuration
 */

import { getSchemeById, DEFAULT_CATEGORICAL_SCHEME, DEFAULT_SEQUENTIAL_SCHEME } from '../../config/colorSchemes';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';

export type ColorScaleKind = 'categorical' | 'continuous';

export interface ColorScaleInfo {
  kind: ColorScaleKind;
  domain: any[] | [number, number];
  range: string[];
  accessor?: (row: any) => number | null;
  rawMin?: any;
  rawMax?: any;
}

/**
 * Get color configuration for Observable Plot from our color scheme ID
 * Returns either a range of colors or a scheme name that Observable Plot understands
 */
export function getPlotColorConfig(colorSchemeId?: string): { range?: string[]; scheme?: string } {
  if (!colorSchemeId) {
    colorSchemeId = DEFAULT_CATEGORICAL_SCHEME;
  }

  const scheme = getSchemeById(colorSchemeId);
  
  if (!scheme) {
    // Fallback to Observable Plot's built-in scheme
    return { scheme: 'Tableau10' };
  }

  // Return our custom color array as a range
  // Observable Plot will use these colors directly
  return { range: scheme.colors };
}

/**
 * Get just the color array for a scheme
 */
export function getColorRange(colorSchemeId?: string): string[] {
  if (!colorSchemeId) {
    colorSchemeId = DEFAULT_CATEGORICAL_SCHEME;
  }

  const scheme = getSchemeById(colorSchemeId);
  
  if (!scheme) {
    // Fallback colors (Tableau 10)
    return ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];
  }

  return scheme.colors;
}

function toNumeric(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    return value.valueOf();
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    const parsedDate = Date.parse(value);
    if (!Number.isNaN(parsedDate)) {
      return parsedDate;
    }
  }
  return null;
}

const DEFAULT_SINGLE_VALUE_EPSILON = 1;

/**
 * Derive a color scale description (domain, range, optional accessor) for a field.
 */
export function deriveColorScaleInfo(
  data: any[] | undefined,
  field: Field,
  colorSchemeId?: string
): ColorScaleInfo | null {
  if (!field || !Array.isArray(data)) {
    return null;
  }

  const fallbackSchemeId = field.flavour === 'continuous' ? DEFAULT_SEQUENTIAL_SCHEME : DEFAULT_CATEGORICAL_SCHEME;
  const scheme = getSchemeById(colorSchemeId || fallbackSchemeId) || getSchemeById(fallbackSchemeId);
  const range = scheme?.colors ?? getColorRange(fallbackSchemeId);
  const columnName = getResultColumnName(field as any);

  if (field.flavour !== 'continuous') {
    const seen = new Set<any>();
    const orderedValues: any[] = [];
    for (const row of data) {
      const value = row?.[columnName];
      const key = value instanceof Date ? value.valueOf() : value;
      if (!seen.has(key)) {
        seen.add(key);
        orderedValues.push(value);
      }
    }
    return {
      kind: 'categorical',
      domain: orderedValues,
      range,
    };
  }

  let minNumeric = Number.POSITIVE_INFINITY;
  let maxNumeric = Number.NEGATIVE_INFINITY;
  let rawMin: any;
  let rawMax: any;

  const accessor = (row: any): number | null => {
    if (!row) return null;
    const raw = row[columnName];
    const numeric = toNumeric(raw);
    return numeric === null ? null : numeric;
  };

  for (const row of data) {
    const numeric = accessor(row);
    if (numeric === null) {
      continue;
    }
    if (numeric < minNumeric) {
      minNumeric = numeric;
      rawMin = row?.[columnName];
    }
    if (numeric > maxNumeric) {
      maxNumeric = numeric;
      rawMax = row?.[columnName];
    }
  }

  if (!Number.isFinite(minNumeric) || !Number.isFinite(maxNumeric)) {
    return null;
  }

  if (minNumeric === maxNumeric) {
    const epsilon = Math.max(Math.abs(minNumeric) * 0.01, DEFAULT_SINGLE_VALUE_EPSILON);
    maxNumeric = minNumeric + epsilon;
  }

  const stableAccessor = (row: any): number | null => {
    const numeric = accessor(row);
    if (numeric === null) {
      return null;
    }
    return numeric;
  };

  return {
    kind: 'continuous',
    domain: [minNumeric, maxNumeric],
    range,
    accessor: stableAccessor,
    rawMin,
    rawMax,
  };
}
