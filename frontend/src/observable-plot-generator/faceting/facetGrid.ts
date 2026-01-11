import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';

/**
 * Grid layout configuration for faceted charts
 */
export interface GridLayout {
  type: 'grid';
  columns: number;
  rows: number;
  columnSizes: Array<number | 'fr'>;
  rowSizes: Array<number | 'fr'>;
}

/**
 * Facet label configuration for grid headers
 */
export interface FacetLabels {
  rowsLevels?: Array<{ fieldLabel: string; values: any[] }>;
  colsLevels?: Array<{ fieldLabel: string; values: any[] }>;
  groupSpan: { columnsPerFacet: number; rowsPerFacet: number };
  spans: {
    baseCols: number;
    baseRows: number;
    columns: number[];
    rows: number[];
  };
}

/**
 * Compute grid layout dimensions and sizes.
 * Extracts layout calculation logic from facetGenerator.
 */
export function computeGridLayout(
  baseCols: number,
  baseRows: number,
  numRowFacets: number,
  numColFacets: number,
  baseColumnSizes?: Array<number | 'fr'>,
  baseRowSizes?: Array<number | 'fr'>
): GridLayout {
  const columns = baseCols * numColFacets;
  const rows = baseRows * numRowFacets;
  
  // Replicate base sizes across facets
  const columnSizes = baseColumnSizes && baseColumnSizes.length > 0
    ? Array.from({ length: columns }, (_, idx) => baseColumnSizes[idx % baseColumnSizes.length])
    : Array.from({ length: columns }, () => 'fr' as const);
    
  const rowSizes = baseRowSizes && baseRowSizes.length > 0
    ? Array.from({ length: rows }, (_, idx) => baseRowSizes[idx % baseRowSizes.length])
    : Array.from({ length: rows }, () => 'fr' as const);
  
  return {
    type: 'grid',
    columns,
    rows,
    columnSizes,
    rowSizes,
  };
}

/**
 * Compute facet labels with proper span calculations.
 * Moved from facetGenerator to separate layout concerns.
 */
export function computeFacetLabels(
  rowFields: Field[],
  colFields: Field[],
  rowValuesLevels: any[][],
  colValuesLevels: any[][],
  baseCols: number,
  baseRows: number
): FacetLabels {
  return {
    rowsLevels: rowFields.length > 0 
      ? rowFields.map((f, i) => ({ 
          fieldLabel: getFieldColumnName(f), 
          values: rowValuesLevels[i] 
        })) 
      : undefined,
    colsLevels: colFields.length > 0 
      ? colFields.map((f, i) => ({ 
          fieldLabel: getFieldColumnName(f), 
          values: colValuesLevels[i] 
        })) 
      : undefined,
    groupSpan: { 
      columnsPerFacet: baseCols, 
      rowsPerFacet: baseRows 
    },
    spans: {
      baseCols,
      baseRows,
      columns: computeLevelSpans(colFields, baseCols, colValuesLevels),
      rows: computeLevelSpans(rowFields, baseRows, rowValuesLevels),
    },
  };
}

/**
 * Compute span widths for hierarchical facet labels.
 * Each level label should span all inner levels and base plots.
 */
function computeLevelSpans(fields: Field[], base: number, levelValues: any[][]): number[] {
  if (!fields || fields.length === 0) return [];
  const spans: number[] = [];
  for (let i = 0; i < fields.length; i++) {
    const innerLevels = (levelValues || []).slice(i + 1);
    const innerProduct = innerLevels.reduce(
      (acc: number, vals: any[]) => acc * (Array.isArray(vals) ? Math.max(1, vals.length) : 1), 
      1
    );
    spans.push(base * innerProduct);
  }
  return spans;
}
