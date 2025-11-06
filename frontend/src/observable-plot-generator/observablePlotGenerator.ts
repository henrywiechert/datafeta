import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from './types';
import { barUnified } from './chartTypes/barUnified';
import { generateChartOptions as genChartOptionsRule, generateScatterPlot } from './rules/chartRules';
import { Field } from '../types';
import { computeSharedMeasureDomains } from './domains/measureDomains';
import { analyzeFields } from './analysis/fieldAnalysis';
import { ChartTypeOverrides } from './helpers/chartTypeResolver';
import { planFacets } from './faceting/facetPlanner';
import { getResultColumnName } from '../utils/fieldUtils';
import { generateCartesianGrid, generateCartesianPlots } from './grid/coreGridGenerator';
import { generateFacetedGrid } from './faceting/facetGenerator';

/**
 * Simple, direct Observable Plot generation
 * No complex pipeline - just analyze fields and generate chart directly
 */
export function generatePlot(context: ChartGenerationContext, overrides?: ChartTypeOverrides): PlotResult {
  const { xFields, yFields, queryResult } = context;

  // Handle empty fields
  if (xFields.length === 0 && yFields.length === 0) {
    return createMessageChart('Drag fields to the axes to create a chart.');
  }

  // Check if we have any data
  if (!queryResult?.rows || queryResult.rows.length === 0) {
    return createMessageChart('No data available.');
  }

  // Analyze fields to determine chart type
  const analysis = analyzeFields(xFields, yFields);
  
  // We allow dimension-only continuous charts (tick-strip/scatter), so do not require measures here.

  try {
    // First, see if faceting is applicable.
    const facetPlan = planFacets(context);
    
    // Only engage faceting when there are discrete fields that should become facets
    if (facetPlan && ((facetPlan.rowFacetFields?.length || 0) > 0 || (facetPlan.colFacetFields?.length || 0) > 0)) {
      return generateFacetedGrid(context, facetPlan);
    }

    // Multi-measure on the same axis -> grid of bar charts (preferred over cartesian pairing)
    // EXCEPT when the opposite axis has a continuous dimension; then use cartesian grid (line charts)
    const labelCfg = buildLabelCfg(context);
    if (analysis.isMultiMeasure && !analysis.hasMixedAxes) {
      const measuresOnX = analysis.hasXMeasure && !analysis.hasYMeasure;
      const oppositeDims = measuresOnX ? (analysis as any).yDimensions : (analysis as any).xDimensions;
      const hasOppositeContinuousDim = Array.isArray(oppositeDims) && oppositeDims.some((d: any) => d.flavour === 'continuous');
      if (!hasOppositeContinuousDim) {
        return barUnified(context, labelCfg);
      }
      // fall through to cartesian grid
    }
    
    // If both axes have at least one candidate (measure or dimension), build a cartesian pairing grid
    // Use only continuous dimensions and measures to form NxM pairs when present
    const xCandidates = [
      ...(analysis.xDimensions || []).filter((d: any) => d.flavour === 'continuous'),
      ...(analysis.xMeasures || [])
    ];
    const yCandidates = [
      ...(analysis.yDimensions || []).filter((d: any) => d.flavour === 'continuous'),
      ...(analysis.yMeasures || [])
    ];

    if (xCandidates.length > 0 && yCandidates.length > 0) {
      return generateCartesianGrid(context, analysis, xCandidates, yCandidates, overrides);
    }

    // Otherwise, generate single chart or simple multi on one axis (rare edge cases)
  const result = genChartOptionsRule(analysis, context, labelCfg);
    return result;

  } catch (error) {
    console.error('Chart generation failed:', error);
    return createMessageChart(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Simple field analysis - no complex classification
 */
// moved to analysis/fieldAnalysis.ts

/**
 * Generate scatter plot for measures on both X and Y axes
 */
// moved to rules/chartRules.ts

export function baseGeneratePlot(context: ChartGenerationContext): PlotResult {
  const { xFields, yFields, queryResult, colorField, colorScheme, sizeField, sizeRange, manualSize } = context;
  const analysis = analyzeFields(xFields, yFields);
  // Do not short-circuit on empty data here; downstream chart creators
  // render empty frames so faceted cells remain consistent.

  // If we have multiple candidates across axes (dimensions and/or measures),
  // build a cartesian grid so that combinations are preserved within faceting.
  const xCandidates: Field[] = [
    ...((analysis as any).xDimensions || []).filter((d: any) => d.flavour === 'continuous'),
    ...((analysis as any).xMeasures || [])
  ];
  const yCandidates: Field[] = [
    ...((analysis as any).yDimensions || []).filter((d: any) => d.flavour === 'continuous'),
    ...((analysis as any).yMeasures || [])
  ];
  const multiAcrossAxes =
    xCandidates.length > 0 && yCandidates.length > 0 && (xCandidates.length > 1 || yCandidates.length > 1);
  if (multiAcrossAxes) {
    // Use provided shared domains if available (from faceting), otherwise compute from local data
    const sharedMeasureDomains = context.sharedDomainsOverride?.measure 
      || computeSharedMeasureDomains(queryResult.rows, xCandidates as any[], yCandidates as any[], colorField);
    const sharedNumericDomains = context.sharedDomainsOverride?.numeric || {};
    const combinedDomains = { ...sharedNumericDomains, ...sharedMeasureDomains };
    
    return {
      library: 'observable-plot',
      plots: generateCartesianPlots(
        queryResult.rows,
        xCandidates,
        yCandidates,
        combinedDomains,
        undefined,
        colorField,
        colorScheme,
        context.colorBias,
        sizeField,
        sizeRange,
        manualSize,
        buildLabelCfg(context)
      ),
      sharedDomains: { byMeasure: sharedMeasureDomains as any },
      layout: {
        type: 'grid',
        columns: xCandidates.length,
        rows: yCandidates.length,
        columnSizes: Array.from({ length: xCandidates.length }, () => 'fr'),
        rowSizes: Array.from({ length: yCandidates.length }, () => 'fr'),
      },
    };
  }

  // Single pair across axes with measures on both sides → single scatter
  if (analysis.hasMixedAxes) {
  const plotOptions = generateScatterPlot(analysis, context, buildLabelCfg(context));
    return { library: 'observable-plot', options: plotOptions, layout: { type: 'single' } };
  }

  // Multi-measure per axis → our existing bar grid
  if (analysis.isMultiMeasure && !analysis.hasMixedAxes) {
    try { return barUnified(context, buildLabelCfg(context)); } catch { /* fall through */ }
  }

  // Fallback to single-chart rules (this handles continuous dimensions on both axes)
  const single = genChartOptionsRule(analysis, context, buildLabelCfg(context));
  return single;
}
/**
 * Compute shared numeric domains for all measures used across a grid.
 * Includes 0 and adds 10% headroom at the top, similar to bar charts.
 */
// moved to domains/measureDomains.ts

/**
 * Create a simple message chart
 */
function createMessageChart(message: string): PlotResult {
  return {
    library: 'observable-plot',
    options: {
      marks: [
        Plot.text([message], {
          frameAnchor: "middle",
          fontSize: 14,
          fill: "gray"
        })
      ]
    },
    layout: { type: 'single' }
  };
}

// Helper to construct unified label configuration object for chart builders
export function buildLabelCfg(context: ChartGenerationContext) {
  const {
    labelFields = [],
    labelsEnabled = false,
    labelSamplingStrategy = 'auto',
    labelSamplingThreshold = 300,
    labelSampleEvery = 1,
    queryResult,
  } = context as any;
  if (!labelsEnabled && (labelFields?.length || 0) === 0) return undefined;

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

  if (queryResult?.rows?.length) {
    const firstRowKeys = Object.keys(queryResult.rows[0] || {});
    console.log('[LabelCfg] Adapted label fields:', adaptedLabelFields.map((f: any) => ({ columnName: f.columnName, original: f.originalColumnName })), 'First row keys:', firstRowKeys);
  }

  return {
    labelFields: adaptedLabelFields,
    labelsEnabled,
    samplingStrategy: labelSamplingStrategy,
    samplingThreshold: labelSamplingThreshold,
    sampleEvery: labelSampleEvery,
  };
}