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
  interpolate?: (t: number) => string; // Custom interpolation function for bias
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
 * Normalize a value to a canonical string key for categorical comparison.
 * Handles Date objects, numbers, strings, null/undefined consistently.
 */
function toCanonicalKey(value: any): string {
  if (value === null || value === undefined) {
    return '__NULL__';
  }
  if (value instanceof Date) {
    return `__DATE__${value.getTime()}`;
  }
  if (typeof value === 'number') {
    return `__NUM__${value}`;
  }
  if (typeof value === 'boolean') {
    return `__BOOL__${value}`;
  }
  // For strings, use directly but prefix to avoid collision with special keys
  return `__STR__${String(value)}`;
}

/**
 * Create a color resolver function from a ColorScaleInfo.
 * This is the single source of truth for resolving data point -> color.
 * 
 * For categorical scales: builds an O(1) lookup map with robust type handling.
 * For continuous scales: normalizes value to [0,1] and maps to color range.
 * 
 * @param colorScale - The color scale info (from deriveColorScaleInfo)
 * @param colorColumnName - The column name to read from data rows
 * @param fallbackColor - Optional color to return when no color field (e.g., manualColor)
 * @returns A function (d: any) => string | undefined that resolves a data row to its color
 */
export function createColorResolver(
  colorScale: ColorScaleInfo | null | undefined,
  colorColumnName: string | undefined,
  fallbackColor?: string
): ((d: any) => string | undefined) | undefined {
  // No color field: return static fallback if provided
  if (!colorScale || !colorColumnName) {
    if (fallbackColor) {
      return () => fallbackColor;
    }
    return undefined;
  }

  if (colorScale.kind === 'categorical') {
    const domain = colorScale.domain as any[];
    const range = colorScale.range;
    
    // Build a Map for O(1) lookup with canonical keys
    const colorMap = new Map<string, string>();
    for (let i = 0; i < domain.length; i++) {
      const key = toCanonicalKey(domain[i]);
      colorMap.set(key, range[i % range.length]);
    }
    
    return (d: any): string | undefined => {
      const val = d?.[colorColumnName];
      const key = toCanonicalKey(val);
      const color = colorMap.get(key);
      
      // If not found in map, try looser matching (handle edge cases like "5" vs 5)
      if (color === undefined) {
        // Try numeric coercion for string/number mismatches
        if (typeof val === 'string') {
          const numVal = Number(val);
          if (!isNaN(numVal)) {
            const numKey = toCanonicalKey(numVal);
            const numColor = colorMap.get(numKey);
            if (numColor !== undefined) return numColor;
          }
        } else if (typeof val === 'number') {
          const strKey = toCanonicalKey(String(val));
          const strColor = colorMap.get(strKey);
          if (strColor !== undefined) return strColor;
        }
        // Value truly not in domain - return undefined (no fallback to first color!)
        return undefined;
      }
      
      return color;
    };
  } else {
    // Continuous scale
    const [min, max] = colorScale.domain as [number, number];
    const range = colorScale.range;
    const accessor = colorScale.accessor;
    
    return (d: any): string | undefined => {
      const raw = accessor ? accessor(d) : toNumeric(d?.[colorColumnName]);
      if (raw === null || raw === undefined || !isFinite(raw as number)) {
        return undefined;
      }
      
      // Handle edge case of single-value domain
      if (max === min) {
        return range[0];
      }
      
      // Normalize to [0, 1]
      const t = Math.max(0, Math.min(1, ((raw as number) - min) / (max - min)));
      
      // Map to color index
      const idx = Math.round(t * (range.length - 1));
      return range[Math.max(0, Math.min(range.length - 1, idx))];
    };
  }
}
