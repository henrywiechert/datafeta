// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { ChartGenerationContext, PlotResult } from '../types';
import { computeGridLayout, computeFacetLabels } from './facetGrid';
import { computeAllFacetBackgrounds } from '../utils/facetBackgroundUtils';
import { harmonizeLineChartDomains } from '../chartTypes/lineChart';
import { buildFacetSpace } from './facetSpace';
import { buildFacetDomainContext } from './facetDomainContext';
import { generateFacetCells, generateSampleCellLayout } from './facetCells';
import { FacetDataIndex } from './facetDataIndex';
import { FacetCoordinatorConfig } from './facetTypes';

// Re-export the shared faceting types from their leaf module so existing
// importers of `./facetCoordinator` continue to work.
export type {
  PositionedPlot,
  CellResult,
  FacetCellContext,
  CellGenerator,
  FacetCoordinatorConfig,
} from './facetTypes';

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
  const dataIndex = new FacetDataIndex(queryResult.rows, rowFacetFields, colFacetFields);
  const domainContext = buildFacetDomainContext(config, facetSpace, dataIndex);
  const sampleLayout = generateSampleCellLayout(context, facetSpace, dataIndex, domainContext, cellGenerator);
  const { baseCols, baseRows, result: sampleResult } = sampleLayout;
  const allPlots = generateFacetCells({
    context,
    plan,
    facetSpace,
    dataIndex,
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
    sampleResult.rowSizes,
    sampleResult.minColumnSizes,
    sampleResult.minRowSizes
  );

  // Compute facet labels
  const facetLabels = computeFacetLabels(
    rowFacetFields,
    colFacetFields,
    facetSpace.rowValuesLevels,
    facetSpace.colValuesLevels,
    baseCols,
    baseRows,
    facetSpace.safeRowCombos,
    facetSpace.safeColCombos,
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
