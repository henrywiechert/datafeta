import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult, LabelConfig } from './types';
import { barUnified } from './chartTypes/barUnified';
import { generateChartOptions as genChartOptionsRule } from './rules/chartRules';
import { Field } from '../types';
import { computeSharedDomainsFromContext, buildLabelConfig } from './utils/configBuilder';
import { analyzeFields } from './analysis/fieldAnalysis';
import { ChartTypeOverrides } from './helpers/chartTypeResolver';
import { planFacets } from './faceting/facetPlanner';
import { getResultColumnName, normalizeTimelineData } from '../utils/fieldUtils';
import { generateCartesianPlots } from './grid/coreGridGenerator';
import { generateFacetedGrid } from './faceting/facetGenerator';

/**
 * Core chart generation logic (internal function).
 * Always returns grid layout with plots array, treating 1x1 as a grid.
 * 
 * This is the unified logic shared by both generatePlot and baseGeneratePlot.
 * - Analyzes fields to determine chart type
 * - Builds cartesian grids for candidate pairs
 * - Handles multi-measure scenarios
 * - Delegates to single-chart rules when needed
 * - Always returns grid layout format (no 'single' type)
 * 
 * @param context - Chart generation context with fields, data, and styling
 * @param overrides - Optional chart type overrides for specific fields
 * @returns PlotResult with plots array and grid layout
 */
function generatePlotCore(context: ChartGenerationContext, overrides?: ChartTypeOverrides): PlotResult {
  const { xFields, yFields, queryResult, colorField, colorScheme, sizeField, sizeRange, manualSize } = context;
  const analysis = analyzeFields(xFields, yFields);

  // Build candidate lists for cartesian pairing, preserving the original field order
  // Only include continuous dimensions and measures (discrete dimensions are handled by faceting)
  const xCandidates: Field[] = xFields.filter((f: Field) => 
    f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
  );
  const yCandidates: Field[] = yFields.filter((f: Field) => 
    f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
  );

  const labelCfg = buildLabelCfg(context);

  // ALWAYS build a cartesian grid when we have candidates on both axes (including 1x1)
  if (xCandidates.length > 0 && yCandidates.length > 0) {
    // Use the unified domain computation function
    const sharedDomains = computeSharedDomainsFromContext(context, {
      xFields: xCandidates,
      yFields: yCandidates,
    });

    const plots = generateCartesianPlots({
      data: queryResult.rows,
      xCandidates,
      yCandidates,
      sharedDomains,
      encoding: {
        color: { field: colorField, scheme: colorScheme, bias: context.colorBias, manual: context.manualColor },
        size: { field: sizeField, range: sizeRange, manual: manualSize },
      },
      labels: labelCfg,
      tooltipFields: context.tooltipFields,
      facetFields: context.facetFields,
      overrides,
      fieldOverrides: context.fieldOverrides,
      fieldOverrideTargets: context.fieldOverrideTargets,
      allFields: [...xFields, ...yFields, ...(colorField ? [colorField] : []), ...(sizeField ? [sizeField] : [])],
      globalChartType: context.globalChartType,
      measureValuesSourceFields: context.measureValuesSourceFields,
    });

    // Determine column/row sizes from plots
    const columnSizes: Array<number | 'fr'> = Array.from({ length: xCandidates.length }, (_, c) => {
      const sample = plots.find((p) => p.position?.col === c);
      const w = (sample as any)?.options?.width;
      return typeof w === 'number' ? w : 'fr';
    });
    const rowSizes: Array<number | 'fr'> = Array.from({ length: yCandidates.length }, (_, r) => {
      const sample = plots.find((p) => p.position?.row === r);
      const h = (sample as any)?.options?.height;
      return typeof h === 'number' ? h : 'fr';
    });

    return {
      library: 'observable-plot',
      plots,
      sharedDomains: { byMeasure: sharedDomains.measure as any },
      layout: {
        type: 'grid',
        columns: xCandidates.length,
        rows: yCandidates.length,
        columnSizes,
        rowSizes,
      },
    };
  }

  // Multi-continuous fields on same axis → stacked grid (bars/tick strips)
  // EXCEPT when opposite axis has continuous fields → falls through to cartesian grid
  if (analysis.isMultiContinuousOnSameAxis) {
    // Determine which axis has the multiple continuous fields
    const xContinuousMeasures = (analysis.xMeasures || []).filter((m: any) => m.flavour === 'continuous');
    const xContinuousDims = (analysis.xDimensions || []).filter((d: any) => d.flavour === 'continuous');
    
    const multiOnX = (xContinuousMeasures.length + xContinuousDims.length) > 1;
    const oppositeDims = multiOnX ? analysis.yDimensions : analysis.xDimensions;
    const hasOppositeContinuousDim = Array.isArray(oppositeDims) && oppositeDims.some((d: any) => d.flavour === 'continuous');
    
    if (!hasOppositeContinuousDim) {
      try {
        return barUnified(context, labelCfg);
      } catch (error) {
        console.warn('Stacked grid generation failed, falling back:', error);
        // fall through to single-chart rules
      }
    }
  }

  // Single pair or single-axis scenarios → delegate to chartRules
  // chartRules will also return grid format after we update it
  const result = genChartOptionsRule(analysis, context, labelCfg);
  return result;
}

/**
 * Simple, direct Observable Plot generation
 * No complex pipeline - just analyze fields and generate chart directly
 */
/**
 * Main entry point for chart generation from the UI.
 * Validates inputs, handles faceting, then delegates to core logic.
 * 
 * @param context - Chart generation context with fields, data, and styling
 * @param overrides - Optional chart type overrides for specific fields
 * @returns PlotResult with plots array and grid layout
 */
export function generatePlot(context: ChartGenerationContext, overrides?: ChartTypeOverrides): PlotResult {
  const { xFields, yFields, queryResult, colorField, manualColor, sizeField } = context;

  // Validate inputs
  if (xFields.length === 0 && yFields.length === 0) {
    return createMessageChart('Drag fields to the axes to create a chart.');
  }

  if (!queryResult?.rows || queryResult.rows.length === 0) {
    return createMessageChart('No data available.');
  }

  // Normalize timeline datetime fields: convert epoch numbers → Date objects
  // so Observable Plot uses time scales (with proper date formatting) instead of linear numeric scales.
  const allFields: Field[] = [
    ...xFields,
    ...yFields,
    ...(colorField ? [colorField] : []),
    ...(sizeField ? [sizeField] : []),
  ];
  const normalizedRows = normalizeTimelineData(queryResult.rows, allFields);
  const normalizedQueryResult = normalizedRows !== queryResult.rows
    ? { ...queryResult, rows: normalizedRows }
    : queryResult;

  // Apply default color if no color field present
  const effectiveContext: ChartGenerationContext = {
    ...context,
    queryResult: normalizedQueryResult,
    colorField,
    manualColor,
  };

  try {
    // Check if faceting is applicable
    const facetPlan = planFacets(effectiveContext);
    
    // Only engage faceting when there are discrete fields that should become facets
    if (facetPlan && ((facetPlan.rowFacetFields?.length || 0) > 0 || (facetPlan.colFacetFields?.length || 0) > 0)) {
      return generateFacetedGrid(effectiveContext, facetPlan);
    }

    // Delegate to core chart generation logic
    return generatePlotCore(effectiveContext, overrides);

  } catch (error) {
    console.error('Chart generation failed:', error);
    return createMessageChart(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Chart generation for faceting system.
 * Skips validation and faceting (already handled by faceting coordinator).
 * 
 * @param context - Chart generation context with fields, data, and styling
 * @param overrides - Optional chart type overrides for specific fields
 * @returns PlotResult with plots array and grid layout
 */
export function baseGeneratePlot(context: ChartGenerationContext, overrides?: ChartTypeOverrides): PlotResult {
  // Delegate directly to core logic without validation or faceting
  // This is used by faceting system where validation has already occurred
  return generatePlotCore(context, overrides);
}
/**
 * Compute shared numeric domains for all measures used across a grid.
 * Includes 0 and adds 10% headroom at the top, similar to bar charts.
 */
// moved to domains/measureDomains.ts

/**
 * Create a simple message chart (as 1x1 grid)
 */
function createMessageChart(message: string): PlotResult {
  return {
    library: 'observable-plot',
    plots: [{
      id: 'message',
      title: '',
      options: {
        marks: [
          Plot.text([message], {
            frameAnchor: "middle",
            fontSize: 14,
            fill: "gray"
          })
        ]
      },
      position: { row: 0, col: 0 }
    }],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr']
    }
  };
}

// Helper to construct unified label configuration object for chart builders
export function buildLabelCfg(context: ChartGenerationContext): LabelConfig | undefined {
  const {
    labelFields = [],
    labelsEnabled = false,
    labelSamplingStrategy = 'auto',
    labelSamplingThreshold = 300,
    labelSampleEvery = 1,
    queryResult,
  } = context as any;

  if (!labelsEnabled && (labelFields?.length || 0) === 0) {
    return undefined;
  }

  // Adapt measure label field columnNames to aggregated aliases present in result rows.
  // If a label field is a measure with aggregation, backend returns column as AGG(col).
  // If measure has no aggregation but other aggregated measures forced a default (e.g., color/size), we still may see SUM(col).
  const adaptedLabelFields = labelFields.map((f: Field) => {
    if (f.type === 'measure') {
      // If explicit aggregation present, use its result alias.
      if (f.aggregation) {
        return { ...f, columnName: getResultColumnName(f), originalColumnName: f.columnName } as any;
      }
      // If no aggregation, check if result rows carry a SUM alias for this column (implicit default applied elsewhere).
      const implicitAlias = `SUM(${f.columnName})`;
      if (queryResult?.rows?.length && Object.prototype.hasOwnProperty.call(queryResult.rows[0], implicitAlias)) {
        return { ...f, columnName: implicitAlias, originalColumnName: f.columnName } as any;
      }
      // Fall back to original name.
      return { ...f };
    }
    // For datetime part dimensions, getResultColumnName already returns alias; but we don't mutate dim names here.
    return f;
  });

  // Include fields that specifically force labels on, even if not part of global labelFields.
  if (queryResult?.rows?.length) {
    const firstRowKeys = Object.keys(queryResult.rows[0] || {});
    console.log(
      '[LabelCfg] Adapted label fields:',
      adaptedLabelFields.map((f: any) => ({
        columnName: f.columnName,
        original: f.originalColumnName,
      })),
      'First row keys:',
      firstRowKeys
    );
  }

  return {
    labelFields: adaptedLabelFields,
    labelsEnabled,
    samplingStrategy: labelSamplingStrategy,
    samplingThreshold: labelSamplingThreshold,
    sampleEvery: labelSampleEvery,
  };
}
