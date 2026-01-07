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
 * - Assembling the grid
 * 
 * Chart-type-specific rendering is delegated to the cellGenerator strategy.
 */
export function coordinateFacetedGrid(config: FacetCoordinatorConfig): PlotResult {
  const { context, plan, cellGenerator, categoryField, sharedCategoryDomain } = config;
  const { xFields, yFields, queryResult, colorField, independentDomains } = context;
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

  // Optional: compute per-column shared domains for independent X across columns
  const perColumnSharedDomains = independentDomains?.x
    ? safeColCombos.map((colCombo) => {
        const colRows = filterRowsByFacets(queryResult.rows, [], [], colFacetFields, colCombo);
        // Fallback to global shared domains if column has no rows
        if (!colRows || colRows.length === 0) return sharedDomains;
        const domainsForColumn = computeSharedDomainsForFaceting(
          colRows,
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

        if (categoryField && sharedCategoryDomain) {
          const categoryColumnName = getFieldColumnName(categoryField);
          domainsForColumn.categorical[categoryColumnName] = sharedCategoryDomain;
        }

        // CRITICAL: Preserve the global color scale to ensure consistent colors across facets
        // The color scale should always be computed from the full dataset, not per-column
        domainsForColumn.colorScale = sharedDomains.colorScale;

        return domainsForColumn;
      })
    : null;

  // Optional: compute per-row shared domains for independent Y across rows
  const perRowSharedDomains = independentDomains?.y
    ? safeRowCombos.map((rowCombo) => {
        const rowRows = filterRowsByFacets(queryResult.rows, rowFacetFields, rowCombo, [], []);
        // Fallback to global shared domains if row has no data
        if (!rowRows || rowRows.length === 0) return sharedDomains;
        const domainsForRow = computeSharedDomainsForFaceting(
          rowRows,
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

        if (categoryField && sharedCategoryDomain) {
          const categoryColumnName = getFieldColumnName(categoryField);
          domainsForRow.categorical[categoryColumnName] = sharedCategoryDomain;
        }

        // CRITICAL: Preserve the global color scale to ensure consistent colors across facets
        domainsForRow.colorScale = sharedDomains.colorScale;

        return domainsForRow;
      })
    : null;

  const effectiveSharedDomains = independentDomains?.x || independentDomains?.y
    ? filterSharedDomainsForIndependentAxes(sharedDomains, xFields, yFields, independentDomains)
    : sharedDomains;

  // Override categorical domain if explicitly provided
  if (categoryField && sharedCategoryDomain) {
    const categoryColumnName = getFieldColumnName(categoryField);
    effectiveSharedDomains.categorical[categoryColumnName] = sharedCategoryDomain;
  }

  // Generate one sample cell to determine base layout dimensions
  const sampleRows = filterRowsByFacets(
    queryResult.rows,
    rowFacetFields,
    safeRowCombos[0],
    colFacetFields,
    safeColCombos[0]
  );
  // Use sample domains that incorporate both column and row independent domains if applicable
  let sampleDomains = effectiveSharedDomains;
  if (perColumnSharedDomains?.[0]) {
    sampleDomains = { ...sampleDomains, ...perColumnSharedDomains[0] };
  }
  if (perRowSharedDomains?.[0]) {
    // Merge Y-specific domains
    const yLabels = new Set(yFields.map((f) => getFieldColumnName(f)));
    for (const key of Object.keys(perRowSharedDomains[0].measure || {})) {
      if (yLabels.has(key)) {
        sampleDomains.measure[key] = perRowSharedDomains[0].measure[key];
      }
    }
  }
  sampleDomains.colorScale = sharedDomains.colorScale;
  const sampleResult = cellGenerator(sampleRows, context, sampleDomains, { row: 0, col: 0 });
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
      
      // Merge per-column (X) and per-row (Y) domains as applicable
      // Start with effective shared domains, then overlay independent axis domains
      let cellDomains = effectiveSharedDomains;
      if (perColumnSharedDomains?.[c]) {
        cellDomains = { ...cellDomains, ...perColumnSharedDomains[c] };
        // Preserve Y domains from effective (they should remain shared across columns)
        if (!independentDomains?.y) {
          // Keep Y-related measure/numeric domains from effectiveSharedDomains
          const yLabels = new Set(yFields.map((f) => getFieldColumnName(f)));
          for (const key of Object.keys(effectiveSharedDomains.measure || {})) {
            if (yLabels.has(key)) {
              cellDomains.measure[key] = effectiveSharedDomains.measure[key];
            }
          }
          for (const key of Object.keys(effectiveSharedDomains.numeric || {})) {
            if (yLabels.has(key)) {
              cellDomains.numeric[key] = effectiveSharedDomains.numeric[key];
            }
          }
        }
      }
      if (perRowSharedDomains?.[r]) {
        // Overlay Y-specific domains from the row
        const yLabels = new Set(yFields.map((f) => getFieldColumnName(f)));
        for (const key of Object.keys(perRowSharedDomains[r].measure || {})) {
          if (yLabels.has(key)) {
            cellDomains.measure[key] = perRowSharedDomains[r].measure[key];
          }
        }
        for (const key of Object.keys(perRowSharedDomains[r].numeric || {})) {
          if (yLabels.has(key)) {
            cellDomains.numeric[key] = perRowSharedDomains[r].numeric[key];
          }
        }
      }
      // Always preserve global color scale
      cellDomains.colorScale = sharedDomains.colorScale;
      
      // Build facet cell context for tooltip generation
      const facetCellContext: FacetCellContext = {
        rowFacetFields,
        colFacetFields,
        rowValues: safeRowCombos[r],
        colValues: safeColCombos[c],
      };
      
      const cellResult = cellGenerator(cellData, context, cellDomains, { row: r, col: c }, facetCellContext);
      
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
    sharedDomains: { byMeasure: effectiveSharedDomains.measure as any },
    layout: gridLayout,
    facetLabels,
  };
}

/**
 * Filter shared domains based on independent axis settings.
 * When an axis is independent, its domains should not be globally shared.
 */
function filterSharedDomainsForIndependentAxes(
  shared: SharedDomains, 
  xFields: Field[], 
  yFields: Field[],
  independentDomains?: { x?: boolean; y?: boolean }
): SharedDomains {
  const xLabels = independentDomains?.x 
    ? xFields.map((f) => getFieldColumnName(f))
    : [];
  const yLabels = independentDomains?.y 
    ? yFields.map((f) => getFieldColumnName(f))
    : [];
  
  const labelsToFilter = new Set([...xLabels, ...yLabels]);
  if (labelsToFilter.size === 0) return shared;

  const filteredMeasure = Object.fromEntries(
    Object.entries(shared.measure || {}).filter(([key]) => !labelsToFilter.has(key))
  ) as Record<string, [number, number]>;

  const filteredNumeric = Object.fromEntries(
    Object.entries(shared.numeric || {}).filter(([key]) => !labelsToFilter.has(key))
  ) as Record<string, [number, number] | [Date, Date]>;

  return {
    ...shared,
    measure: filteredMeasure,
    numeric: filteredNumeric,
    // Always preserve color scale - it should be global
    colorScale: shared.colorScale,
  };
}
