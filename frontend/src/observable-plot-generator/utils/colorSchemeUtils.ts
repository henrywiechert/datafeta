/**
 * Utility to convert our color scheme ID to Observable Plot color configuration
 */

import { getSchemeById, DEFAULT_CATEGORICAL_SCHEME, DEFAULT_SEQUENTIAL_SCHEME } from '../../config/colorSchemes';
import { Field, FieldOverrideState } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { isMeasureNamesField } from '../../utils/syntheticFields';

export type ColorScaleKind = 'categorical' | 'continuous';

export interface ColorScaleInfo {
  kind: ColorScaleKind;
  domain: any[] | [number, number];
  range: string[];
  accessor?: (row: any) => number | null;
  rawMin?: any;
  rawMax?: any;
  interpolate?: (t: number) => string; // Custom interpolation function for bias
}

/**
 * Get just the color array for a scheme.
 * Used internally by deriveColorScaleInfo.
 */
function getColorRange(colorSchemeId?: string): string[] {
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
 * Apply bias to a normalized value (0-1).
 * Bias ranges from -1 (left emphasis) to 1 (right emphasis), with 0 being neutral.
 * Uses power scaling: bias < 0 uses exponent > 1, bias > 0 uses exponent < 1.
 */
function applyBias(t: number, bias: number): number {
  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t));
  
  if (bias === 0) {
    return t;
  }
  
  // Convert bias (-1 to 1) to exponent
  // bias = -1 -> exponent = 3 (compress left side)
  // bias = 0 -> exponent = 1 (linear)
  // bias = 1 -> exponent = 0.33 (compress right side)
  const exponent = Math.pow(2, -bias);
  
  return Math.pow(t, exponent);
}

/**
 * Derive a color scale description (domain, range, optional accessor) for a field.
 * For continuous fields, bias parameter adjusts the color gradient emphasis.
 */
export function deriveColorScaleInfo(
  data: any[] | undefined,
  field: Field,
  colorSchemeId?: string,
  colorBias: number = 0
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
    const uniqueValues: any[] = [];
    for (const row of data) {
      const value = row?.[columnName];
      const key = value instanceof Date ? value.valueOf() : value;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueValues.push(value);
      }
    }
    
    // Helper to parse numeric strings
    const parseNumeric = (v: any): number | null => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed === '') return null;
        const num = Number(trimmed);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };
    
    // Sort categories for stable color assignment across queries
    // Numbers/numeric strings: ascending numeric order
    // Strings: natural sort (handles "item2" vs "item10")
    // Dates: chronological
    // Mixed/null: nulls last, then by type
    uniqueValues.sort((a, b) => {
      // Handle nulls - push to end
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      // Dates
      if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
      }
      // Try numeric comparison (works for numbers and numeric strings like "1", "2", "10")
      const numA = parseNumeric(a);
      const numB = parseNumeric(b);
      if (numA !== null && numB !== null) {
        return numA - numB;
      }
      // Strings: use natural sort (numeric-aware collation)
      if (typeof a === 'string' && typeof b === 'string') {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      }
      // Mixed types: convert to string with natural sort
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    });
    return {
      kind: 'categorical',
      domain: uniqueValues,
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

  // Create interpolation function with bias if needed
  let interpolate: ((t: number) => string) | undefined = undefined;
  if (colorBias !== 0 && range.length > 0) {
    interpolate = (t: number) => {
      const biasedT = applyBias(t, colorBias);
      const idx = biasedT * (range.length - 1);
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      
      if (lower === upper || upper >= range.length) {
        return range[Math.min(lower, range.length - 1)];
      }
      
      // Simple linear interpolation between two colors (could be enhanced with proper color space interpolation)
      const frac = idx - lower;
      return interpolateColors(range[lower], range[upper], frac);
    };
  }

  return {
    kind: 'continuous',
    domain: [minNumeric, maxNumeric],
    range,
    accessor: stableAccessor,
    rawMin,
    rawMax,
    interpolate,
  };
}

/**
 * Resolve the actual color string for a single row given a `ColorScaleInfo`.
 *
 * Used by renderers that emit colors directly into the DOM (rather than via a
 * Plot scale) — currently the table-refactor symbol cells. Mirrors the
 * categorical lookup that Plot's `ordinal` scale performs and the linear
 * interpolation that Plot's `linear` scale performs (with bias support via
 * `scale.interpolate` when present).
 *
 * Returns `fallback` when the scale or value cannot resolve to a color (e.g.
 * the row is missing the column, value isn't numeric for a continuous scale,
 * or the categorical domain doesn't include the value).
 */
export function resolveColorForRow(
  row: any,
  scale: ColorScaleInfo | null,
  colorField: Field | undefined,
  fallback: string,
): string {
  if (!scale || !colorField) return fallback;
  if (scale.range.length === 0) return fallback;

  if (scale.kind === 'categorical') {
    const column = getResultColumnName(colorField);
    const value = row?.[column];
    const domain = scale.domain as any[];
    const idx = domain.findIndex((d) => {
      if (d instanceof Date && value instanceof Date) return d.getTime() === value.getTime();
      return d === value;
    });
    if (idx < 0) return fallback;
    return scale.range[idx % scale.range.length];
  }

  // Continuous: map value → t in [0, 1] across the numeric domain, then
  // delegate to the bias-aware interpolator if present, otherwise fall back to
  // a linear interpolation between adjacent stops in `range`.
  const numeric = scale.accessor ? scale.accessor(row) : null;
  if (numeric === null) return fallback;
  const [min, max] = scale.domain as [number, number];
  const span = max - min;
  const tRaw = span > 0 ? (numeric - min) / span : 0;
  const t = Math.max(0, Math.min(1, tRaw));
  if (scale.interpolate) return scale.interpolate(t);

  const idxFloat = t * (scale.range.length - 1);
  const lower = Math.floor(idxFloat);
  const upper = Math.ceil(idxFloat);
  if (lower === upper || upper >= scale.range.length) {
    return scale.range[Math.min(lower, scale.range.length - 1)];
  }
  const frac = idxFloat - lower;
  return interpolateColors(scale.range[lower], scale.range[upper], frac);
}

/**
 * Simple RGB color interpolation between two hex colors
 */
function interpolateColors(color1: string, color2: string, t: number): string {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  
  const r1 = parseInt(hex1.substring(0, 2), 16);
  const g1 = parseInt(hex1.substring(2, 4), 16);
  const b1 = parseInt(hex1.substring(4, 6), 16);
  
  const r2 = parseInt(hex2.substring(0, 2), 16);
  const g2 = parseInt(hex2.substring(2, 4), 16);
  const b2 = parseInt(hex2.substring(4, 6), 16);
  
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Apply per-measure color overrides to a color scale when the color field is MeasureNames.
 * This allows users to set specific colors for individual measures when using MeasureValues.
 * 
 * @param colorScale - The existing color scale info
 * @param colorField - The color field (must be MeasureNames for overrides to apply)
 * @param measureValuesSourceFields - Source measures contributing to MeasureValues
 * @param fieldOverrides - Per-field overrides keyed by field ID
 * @returns Modified color scale with per-measure overrides applied, or original if no overrides
 */
export function applyMeasureNameColorOverrides(
  colorScale: ColorScaleInfo | null,
  colorField: Field | undefined,
  measureValuesSourceFields: Field[] | undefined,
  fieldOverrides: Record<string, FieldOverrideState> | undefined
): ColorScaleInfo | null {
  // Only apply overrides if:
  // 1. We have a color scale
  // 2. The color field is MeasureNames
  // 3. We have source measures and field overrides
  if (
    !colorScale ||
    !colorField ||
    !isMeasureNamesField(colorField) ||
    !measureValuesSourceFields?.length ||
    !fieldOverrides ||
    colorScale.kind !== 'categorical'
  ) {
    return colorScale;
  }

  // Build a map from measure name to override color
  const overrideColorMap = new Map<string, string>();
  for (const sourceField of measureValuesSourceFields) {
    const override = fieldOverrides[sourceField.id];
    if (override?.manualColor) {
      overrideColorMap.set(sourceField.columnName, override.manualColor);
    }
  }

  // If no overrides found, return original scale
  if (overrideColorMap.size === 0) {
    return colorScale;
  }

  // Create new range with overridden colors
  const newRange = colorScale.domain.map((measureName, index) => {
    const overrideColor = overrideColorMap.get(measureName);
    if (overrideColor) {
      return overrideColor;
    }
    // Fall back to original color from the range
    return colorScale.range[index % colorScale.range.length];
  });

  return {
    ...colorScale,
    range: newRange,
  };
}

