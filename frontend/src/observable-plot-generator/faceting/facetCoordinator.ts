import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import { ChartGenerationContext, PlotResult } from '../types';
import { FacetPlan } from './facetPlanner';
import { buildFacetCombos, filterRowsByFacets, uniqueValuesForField } from './facetUtils';
import { computeSharedDomainsForFaceting, SharedDomains } from './facetDomains';
import { computeGridLayout, computeFacetLabels } from './facetGrid';
import { getFieldColumnName } from '../helpers/fields';

/**
 * A single plot specification with position
 */
export interface PositionedPlot {
  id: string;
  title: string;
  options: Plot.PlotOptions;
  position: { row: number; col: number };
}

/**
 * Result from a cell generator containing one or more plots
 */
export interface CellResult {
  plots: PositionedPlot[];
  columns: number;
  rows: number;
  columnSizes?: Array<number | 'fr'>;
  rowSizes?: Array<number | 'fr'>;
}

/**
 * Function that generates plot(s) for a single facet cell.
 * This is the strategy pattern - different chart types can provide different generators.
 */
export type CellGenerator = (
  cellData: any[],
  cellContext: ChartGenerationContext,
  sharedDomains: SharedDomains,
  facetPosition: { row: number; col: number }
) => CellResult;

/**
 * Configuration for the faceting coordinator
 */
export interface FacetCoordinatorConfig {
  context: ChartGenerationContext;
  plan: FacetPlan;
  cellGenerator: CellGenerator;
  categoryField?: Field | null;
  sharedCategoryDomain?: any[];
}

/**
 * Main faceting orchestrator - chart-type agnostic.
 * 
 * This function handles the mechanical aspects of faceting:
 * - Computing facet combinations
 * - Computing shared domains
 * - Looping through facets
 * - Filtering data per facet
 * - Assembling the grid
 * 
 * Chart-type-specific rendering is delegated to the cellGenerator strategy.
 */
export function coordinateFacetedGrid(config: FacetCoordinatorConfig): PlotResult {
  const { context, plan, cellGenerator, categoryField, sharedCategoryDomain } = config;
  const { xFields, yFields, queryResult, colorField } = context;
  const { rowFacetFields, colFacetFields } = plan;

  // Compute facet levels and combinations
  const rowValuesLevels = rowFacetFields.map((f) => uniqueValuesForField(queryResult.rows, f));
  const colValuesLevels = colFacetFields.map((f) => uniqueValuesForField(queryResult.rows, f));
  const rowCombos = buildFacetCombos(rowFacetFields, rowValuesLevels);
  const colCombos = buildFacetCombos(colFacetFields, colValuesLevels);
  const safeRowCombos = rowCombos.length > 0 ? rowCombos : [[]];
  const safeColCombos = colCombos.length > 0 ? colCombos : [[]];

  // Compute shared domains across all facets
  const sharedDomains = computeSharedDomainsForFaceting(
    queryResult.rows,
    xFields,
    yFields,
    colorField,
    categoryField || undefined,
    [...rowFacetFields, ...colFacetFields],
    context.colorScheme,
    context.colorBias,
    context.measureValuesSourceFields,
    context.fieldOverrides
  );

  // Override categorical domain if explicitly provided
  if (categoryField && sharedCategoryDomain) {
    const categoryColumnName = getFieldColumnName(categoryField);
    sharedDomains.categorical[categoryColumnName] = sharedCategoryDomain;
  }

  // Generate one sample cell to determine base layout dimensions
  const sampleRows = filterRowsByFacets(
    queryResult.rows,
    rowFacetFields,
    safeRowCombos[0],
    colFacetFields,
    safeColCombos[0]
  );
  const sampleResult = cellGenerator(sampleRows, context, sharedDomains, { row: 0, col: 0 });
  const baseCols = sampleResult.columns;
  const baseRows = sampleResult.rows;

  // Generate all facet cells
  const allPlots: PositionedPlot[] = [];
  for (let r = 0; r < safeRowCombos.length; r++) {
    for (let c = 0; c < safeColCombos.length; c++) {
      const cellData = filterRowsByFacets(
        queryResult.rows,
        rowFacetFields,
        safeRowCombos[r],
        colFacetFields,
        safeColCombos[c]
      );
      
      const cellResult = cellGenerator(cellData, context, sharedDomains, { row: r, col: c });
      
      // Offset plots to their correct grid position
      cellResult.plots.forEach((p) => {
        allPlots.push({
          ...p,
          id: `${p.id}-r${r}-c${c}`,
          position: {
            row: r * baseRows + p.position.row,
            col: c * baseCols + p.position.col,
          },
        });
      });
    }
  }

  // Compute final grid layout
  const gridLayout = computeGridLayout(
    baseCols,
    baseRows,
    safeRowCombos.length,
    safeColCombos.length,
    sampleResult.columnSizes,
    sampleResult.rowSizes
  );

  // Compute facet labels
  const facetLabels = computeFacetLabels(
    rowFacetFields,
    colFacetFields,
    rowValuesLevels,
    colValuesLevels,
    baseCols,
    baseRows
  );

  return {
    library: 'observable-plot',
    plots: allPlots,
    sharedDomains: { byMeasure: sharedDomains.measure as any },
    layout: gridLayout,
    facetLabels,
  };
}
