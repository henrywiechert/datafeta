// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { getSchemeById, categoricalSchemes } from '../../config/colorSchemes';
import { getFieldColumnName } from '../helpers/fields';

/**
 * Result of computing facet background for a single facet cell
 */
export interface FacetBackgroundResult {
  /** CSS background color with opacity applied, or null if mixed/not applicable */
  backgroundColor: string | null;
  /** Whether this facet has mixed values (not uniform) */
  isMixed: boolean;
  /** The uniform value if applicable */
  uniformValue: any | null;
}

/**
 * Compute the unique values of a background field within a subset of data
 */
function getUniqueValues(data: any[], field: Field): any[] {
  const col = getFieldColumnName(field);
  const seen = new Set<string>();
  const values: any[] = [];
  
  for (const row of data) {
    const v = row[col];
    const key = String(v);
    if (!seen.has(key)) {
      seen.add(key);
      values.push(v);
    }
  }
  
  return values;
}

/**
 * Build a color map for all unique values of the background field across the entire dataset.
 * This ensures consistent colors across all facets.
 * 
 * IMPORTANT: Values are sorted to ensure consistent color assignment that matches the legend.
 * Numeric values are sorted numerically, others are sorted alphabetically.
 */
export function buildBackgroundColorMap(
  allData: any[],
  backgroundField: Field,
  schemeId: string
): Map<string, string> {
  const colorMap = new Map<string, string>();
  const scheme = getSchemeById(schemeId) || categoricalSchemes[0];
  const colors = scheme.colors;
  
  // Get all unique values across the entire dataset
  const uniqueValues = getUniqueValues(allData, backgroundField);
  
  // Sort values for consistent ordering (must match BackgroundLegendPanel sorting)
  try {
    const allNumeric = uniqueValues.every(v => typeof v === 'number' && !Number.isNaN(v));
    if (allNumeric) {
      uniqueValues.sort((a, b) => a - b);
    } else {
      uniqueValues.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
    }
  } catch {
    // ignore sort errors
  }
  
  // Map each value to a color
  uniqueValues.forEach((value, index) => {
    const color = colors[index % colors.length];
    colorMap.set(String(value), color);
  });
  
  return colorMap;
}

/**
 * Convert a hex color to RGBA with specified opacity
 */
function hexToRgba(hex: string, opacity: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  
  // Parse hex values
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Compute the background color for a single facet cell.
 * Returns a pastel color if all data points in the facet share the same value,
 * or null if values are mixed.
 * 
 * @param facetData - Data rows for this specific facet cell
 * @param backgroundField - The field to check for uniformity
 * @param colorMap - Pre-computed color mapping from buildBackgroundColorMap
 * @param opacity - Opacity for the pastel effect (0.05-0.35)
 */
export function computeFacetBackground(
  facetData: any[],
  backgroundField: Field,
  colorMap: Map<string, string>,
  opacity: number
): FacetBackgroundResult {
  if (facetData.length === 0) {
    return { backgroundColor: null, isMixed: false, uniformValue: null };
  }
  
  const uniqueValues = getUniqueValues(facetData, backgroundField);
  
  // If more than one unique value, this facet is "mixed"
  if (uniqueValues.length !== 1) {
    return { backgroundColor: null, isMixed: true, uniformValue: null };
  }
  
  // Single unique value - get the color
  const uniformValue = uniqueValues[0];
  const baseColor = colorMap.get(String(uniformValue));
  
  if (!baseColor) {
    return { backgroundColor: null, isMixed: false, uniformValue };
  }
  
  // Apply opacity for pastel effect
  const backgroundColor = hexToRgba(baseColor, opacity);
  
  return { backgroundColor, isMixed: false, uniformValue };
}

/**
 * Compute facet backgrounds for all facet cells at once.
 * This is the main entry point for the feature.
 * 
 * @param allData - Complete dataset
 * @param plots - Plot configurations with positions
 * @param facetPlan - Information about how data is faceted
 * @param backgroundField - The discrete field to color by
 * @param schemeId - Color scheme ID
 * @param opacity - Opacity for pastel effect
 * @param filterRowsByPosition - Function to get data for a specific facet position
 */
export interface FacetBackgroundMap {
  /** Map from plot ID to background result */
  backgrounds: Map<string, FacetBackgroundResult>;
  /** Pre-computed color map for legend display if needed */
  colorMap: Map<string, string>;
}

export function computeAllFacetBackgrounds(
  allData: any[],
  backgroundField: Field,
  schemeId: string,
  opacity: number
): {
  colorMap: Map<string, string>;
  getBackgroundForData: (facetData: any[]) => FacetBackgroundResult;
} {
  // Build color map once for consistent colors
  const colorMap = buildBackgroundColorMap(allData, backgroundField, schemeId);
  
  // Return a function that can compute background for any facet's data
  const getBackgroundForData = (facetData: any[]): FacetBackgroundResult => {
    return computeFacetBackground(facetData, backgroundField, colorMap, opacity);
  };
  
  return { colorMap, getBackgroundForData };
}
