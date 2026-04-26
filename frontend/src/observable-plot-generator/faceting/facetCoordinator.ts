import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import { ChartGenerationContext, PlotResult, FacetBackgroundInfo } from '../types';
import { FacetPlan } from './facetPlanner';
import { SharedDomains } from './facetDomains';
import { computeGridLayout, computeFacetLabels } from './facetGrid';
import { computeAllFacetBackgrounds } from '../utils/facetBackgroundUtils';
import { harmonizeLineChartDomains } from '../chartTypes/lineChart';
import { buildFacetSpace } from './facetSpace';
import { buildFacetDomainContext } from './facetDomainContext';
import { generateFacetCells, generateSampleCellLayout } from './facetCells';

/**
 * A single plot specification with position
 */
export interface PositionedPlot {
  id: string;
  title: string;
  options: Plot.PlotOptions;
  position: { row: number; col: number };
  /** Optional facet background info for this cell */
  facetBackground?: FacetBackgroundInfo;
  /** X-axis field for this cell (used by brush zoom) */
  xField?: Field;
  /** Y-axis field for this cell (used by brush zoom) */
  yField?: Field;
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
 * Context describing the facet dimensions for the current cell.
 * Used to include facet field values in tooltips.
 */
export interface FacetCellContext {
  /** Fields used for row faceting */
  rowFacetFields: Field[];
  /** Fields used for column faceting */
  colFacetFields: Field[];
  /** Values for row facet fields in this cell (parallel to rowFacetFields) */
  rowValues: any[];
  /** Values for column facet fields in this cell (parallel to colFacetFields) */
  colValues: any[];
}

/**
 * Function that generates plot(s) for a single facet cell.
 * This is the strategy pattern - different chart types can provide different generators.
 */
export type CellGenerator = (
  cellData: any[],
  cellContext: ChartGenerationContext,
  sharedDomains: SharedDomains,
  facetPosition: { row: number; col: number },
  facetCellContext?: FacetCellContext
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
 * - Computing facet backgrounds (if configured)
 * - Assembling the grid
 * 
 * Chart-type-specific rendering is delegated to the cellGenerator strategy.
 */
export function coordinateFacetedGrid(config: FacetCoordinatorConfig): PlotResult {
  const { context, plan, cellGenerator } = config;
  const { queryResult } = context;
  const { rowFacetFields, colFacetFields } = plan;
  
  // Set up facet background computation if configured
  const backgroundHelper = buildBackgroundHelper(context);
  const facetSpace = buildFacetSpace(queryResult.rows, rowFacetFields, colFacetFields);
  const domainContext = buildFacetDomainContext(config, facetSpace);
  const sampleLayout = generateSampleCellLayout(context, plan, facetSpace, domainContext, cellGenerator);
  const { baseCols, baseRows, result: sampleResult } = sampleLayout;
  const allPlots = generateFacetCells({
    context,
    plan,
    facetSpace,
    domainContext,
    cellGenerator,
    backgroundHelper,
    baseCols,
    baseRows,
  });

  // Line charts compute their dependent-axis domain from per-cell data which
  // may differ across facets. Harmonize so all facets share the same scale.
  harmonizeLineChartDomains(allPlots);

  // Compute final grid layout
  const gridLayout = computeGridLayout(
    baseCols,
    baseRows,
    facetSpace.safeRowCombos.length,
    facetSpace.safeColCombos.length,
    sampleResult.columnSizes,
    sampleResult.rowSizes
  );

  // Compute facet labels
  const facetLabels = computeFacetLabels(
    rowFacetFields,
    colFacetFields,
    facetSpace.rowValuesLevels,
    facetSpace.colValuesLevels,
    baseCols,
    baseRows
  );

  return {
    library: 'observable-plot',
    plots: allPlots,
    sharedDomains: { byMeasure: domainContext.effectiveSharedDomains.measure as any },
    layout: gridLayout,
    facetLabels,
  };
}

function buildBackgroundHelper(context: ChartGenerationContext): ReturnType<typeof computeAllFacetBackgrounds> | null {
  const { facetBackgroundField, facetBackgroundScheme, facetBackgroundOpacity, queryResult } = context;
  return facetBackgroundField
    ? computeAllFacetBackgrounds(
        queryResult.rows,
        facetBackgroundField,
        facetBackgroundScheme || 'tableau10',
        facetBackgroundOpacity ?? 0.12
      )
    : null;
}
