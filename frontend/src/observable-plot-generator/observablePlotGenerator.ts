import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from './types';
import { multiMeasureBarChart } from './chartTypes/multiMeasureBarChart';
import { generateChartOptions as genChartOptionsRule, generateScatterPlot } from './rules/chartRules';
import { Field } from '../types';
import { computeSharedMeasureDomains } from './domains/measureDomains';
import { analyzeFields } from './analysis/fieldAnalysis';
import { ChartTypeOverrides } from './helpers/chartTypeResolver';
import { planFacets } from './faceting/facetPlanner';
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
    if (facetPlan) {
      // It's possible to have a plan but no facets, e.g., for a single bar chart
      // that needs a category axis. The faceting logic handles this 1x1 case.
      return generateFacetedGrid(context, facetPlan);
    }

    // Multi-measure on the same axis -> grid of bar charts (preferred over cartesian pairing)
    if (analysis.isMultiMeasure && !analysis.hasMixedAxes) {
      return multiMeasureBarChart(context);
    }
    
    // If both axes have at least one candidate (measure or dimension), build a cartesian pairing grid
    // This includes single charts as 1x1 grids for unified domain handling
    const xCandidates = [...analysis.xMeasures, ...analysis.xDimensions];
    const yCandidates = [...analysis.yMeasures, ...analysis.yDimensions];

    if (xCandidates.length > 0 && yCandidates.length > 0) {
      return generateCartesianGrid(context, analysis, xCandidates, yCandidates, overrides);
    }

    // Otherwise, generate single chart or simple multi on one axis (rare edge cases)
    const result = genChartOptionsRule(analysis, context);
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
  const { xFields, yFields, queryResult } = context;
  const analysis = analyzeFields(xFields, yFields);
  // Do not short-circuit on empty data here; downstream chart creators
  // render empty frames so faceted cells remain consistent.

  // Mixed-axis measures → scatter
  if (analysis.hasMixedAxes) {
    const plotOptions = generateScatterPlot(analysis, context);
    return { library: 'observable-plot', options: plotOptions, layout: { type: 'single' } };
  }

  // If we have multiple candidates across axes (dimensions and/or measures),
  // build a cartesian grid so that combinations are preserved within faceting.
  const xCandidates: Field[] = [...(analysis as any).xMeasures, ...(analysis as any).xDimensions];
  const yCandidates: Field[] = [...(analysis as any).yMeasures, ...(analysis as any).yDimensions];
  const multiAcrossAxes =
    xCandidates.length > 0 && yCandidates.length > 0 && (xCandidates.length > 1 || yCandidates.length > 1);
  if (multiAcrossAxes) {
    // In faceting base-spec we don't need shared measure domains when only dimensions are used.
    const sharedMeasureDomains = computeSharedMeasureDomains(queryResult.rows, xCandidates as any[], yCandidates as any[]);
    return {
      library: 'observable-plot',
      plots: generateCartesianPlots(queryResult.rows, xCandidates, yCandidates, sharedMeasureDomains),
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

  // Multi-measure per axis → our existing bar grid
  if (analysis.isMultiMeasure && !analysis.hasMixedAxes) {
    try { return multiMeasureBarChart(context); } catch { /* fall through */ }
  }

  // Fallback to single-chart rules (this handles continuous dimensions on both axes)
  const single = genChartOptionsRule(analysis, context);
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