import { useMemo } from 'react';

/**
 * Generate CSS Grid template string from size array.
 * Converts numeric values to px and 'fr' values to minmax with minimum constraint.
 * 
 * @param sizes - Array of track sizes (number in px or 'fr' for flexible)
 * @param minPx - Minimum pixel size for flexible tracks
 * @returns CSS Grid template string (e.g., "400px minmax(160px, 1fr) 300px")
 */
function generateTemplateString(
  sizes: Array<number | 'fr'>,
  minPx: number
): string {
  if (!sizes || sizes.length === 0) {
    return `minmax(${minPx}px, 1fr)`;
  }
  
  return sizes
    .map((size) => {
      if (typeof size === 'number') {
        return `${size}px`;
      } else {
        return `minmax(${minPx}px, 1fr)`;
      }
    })
    .join(' ');
}

/**
 * Hook to generate CSS Grid template strings for columns and rows.
 * Memoized to avoid unnecessary recalculations.
 * 
 * @param columnSizes - Array of column sizes
 * @param rowSizes - Array of row sizes
 * @param options - Configuration with minimum pixel constraints
 * @returns Object with column and row template strings
 * 
 * @example
 * const { columns, rows } = useGridTemplates(
 *   [400, 'fr', 300],
 *   [200, 150, 'fr'],
 *   { minColumnPx: 160, minRowPx: 120 }
 * );
 * // columns: "400px minmax(160px, 1fr) 300px"
 * // rows: "200px 150px minmax(120px, 1fr)"
 */
export function useGridTemplates(
  columnSizes: Array<number | 'fr'> | undefined,
  rowSizes: Array<number | 'fr'> | undefined,
  options: {
    minColumnPx: number;
    minRowPx: number;
  }
) {
  const { minColumnPx, minRowPx } = options;
  
  return useMemo(() => ({
    columns: generateTemplateString(columnSizes || [], minColumnPx),
    rows: generateTemplateString(rowSizes || [], minRowPx),
  }), [columnSizes, rowSizes, minColumnPx, minRowPx]);
}

/**
 * Variant for vertical layout (single column).
 * 
 * @param minColumnPx - Minimum column width
 * @returns Template string for single flexible column
 */
export function useVerticalGridTemplate(minColumnPx: number): string {
  return useMemo(
    () => `minmax(${minColumnPx}px, 1fr)`,
    [minColumnPx]
  );
}

/**
 * Generate repeated template string for uniform sizing.
 * Used when all tracks should have the same size.
 * 
 * @param count - Number of tracks
 * @param size - Size per track (number in px or 'fr' for flexible)
 * @param minPx - Minimum pixel size for flexible tracks
 * @returns CSS Grid template string (e.g., "repeat(3, 400px)")
 * 
 * @example
 * generateUniformTemplate(5, 300, 160)
 * // "repeat(5, 300px)"
 * 
 * generateUniformTemplate(3, 'fr', 160)
 * // "repeat(3, minmax(160px, 1fr))"
 */
export function generateUniformTemplate(
  count: number,
  size: number | 'fr',
  minPx: number
): string {
  if (count <= 0) {
    return `minmax(${minPx}px, 1fr)`;
  }
  
  const trackSize = typeof size === 'number'
    ? `${size}px`
    : `minmax(${minPx}px, 1fr)`;
  
  return `repeat(${count}, ${trackSize})`;
}

