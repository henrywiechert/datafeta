/**
 * Utility to convert our color scheme ID to Observable Plot color configuration
 */

import { getSchemeById, DEFAULT_CATEGORICAL_SCHEME } from '../../config/colorSchemes';

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
