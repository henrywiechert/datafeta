import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from './types';
import { barChart } from './chartTypes/barChart';
import { multiMeasureBarChart } from './chartTypes/multiMeasureBarChart';
import { getResultColumnName } from '../utils/fieldUtils';

/**
 * Simple, direct Observable Plot generation
 * No complex pipeline - just analyze fields and generate chart directly
 */
export function generatePlot(context: ChartGenerationContext): PlotResult {
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
  
  // Check if we have measures (required for charts)
  if (!analysis.hasMeasure) {
    return createMessageChart('Drag a measure to an axis to create a chart.');
  }

  try {
    // Check if we have measures on both X and Y axes -> scatter plot
    if (analysis.hasMixedAxes) {
      const plotOptions = generateScatterPlot(analysis, context);
      return {
        library: 'observable-plot',
        options: plotOptions,
        layout: { type: 'single' }
      };
    }
    
    // Check if we need multi-measure charts (same axis)
    if (analysis.isMultiMeasure) {
      return multiMeasureBarChart(context);
    }
    
    // Generate single chart
    const plotOptions = generateChartOptions(analysis, context);
    
    return {
      library: 'observable-plot',
      options: plotOptions,
      layout: { type: 'single' }
    };

  } catch (error) {
    console.error('Chart generation failed:', error);
    return createMessageChart(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Simple field analysis - no complex classification
 */
interface FieldAnalysis {
  hasMeasure: boolean;
  hasXMeasure: boolean;
  hasYMeasure: boolean;
  hasXDimension: boolean;
  hasYDimension: boolean;
  xMeasures: any[];
  yMeasures: any[];
  xDimensions: any[];
  yDimensions: any[];
  totalMeasures: number;
  isMultiMeasure: boolean;
  hasMixedAxes: boolean; // Measures on both X and Y axes
}

function analyzeFields(xFields: any[], yFields: any[]): FieldAnalysis {
  const xMeasures = xFields.filter(f => f.type === 'measure');
  const yMeasures = yFields.filter(f => f.type === 'measure');
  const xDimensions = xFields.filter(f => f.type === 'dimension');
  const yDimensions = yFields.filter(f => f.type === 'dimension');
  
  const totalMeasures = xMeasures.length + yMeasures.length;

  return {
    hasMeasure: totalMeasures > 0,
    hasXMeasure: xMeasures.length > 0,
    hasYMeasure: yMeasures.length > 0,
    hasXDimension: xDimensions.length > 0,
    hasYDimension: yDimensions.length > 0,
    xMeasures,
    yMeasures,
    xDimensions,
    yDimensions,
    totalMeasures,
    isMultiMeasure: totalMeasures > 1,
    hasMixedAxes: xMeasures.length > 0 && yMeasures.length > 0, // Measures on both axes
  };
}

/**
 * Generate scatter plot for measures on both X and Y axes
 */
function generateScatterPlot(analysis: FieldAnalysis, context: ChartGenerationContext): Plot.PlotOptions {
  const { queryResult } = context;
  const data = queryResult?.rows || [];
  
  // Get the first measure from each axis (for simplicity)
  const xMeasure = analysis.xMeasures[0];
  const yMeasure = analysis.yMeasures[0];
  
  // Generate column names for measures
  const xFieldForName = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' };
  const yFieldForName = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' };
  const xColumnName = getResultColumnName(xFieldForName);
  const yColumnName = getResultColumnName(yFieldForName);
  
  return {
    width: 400,
    height: 300,
    x: {
      label: xColumnName,
      grid: true,
    },
    y: {
      label: yColumnName,
      grid: true,
    },
    marks: [
      Plot.dot(data, {
        x: xColumnName,
        y: yColumnName,
        fill: "steelblue",
        r: 4, // Fixed radius for dots
      }),
      Plot.ruleX([0]),
      Plot.ruleY([0])
    ]
  };
}

/**
 * Generate single chart options based on simple field analysis
 */
function generateChartOptions(analysis: FieldAnalysis, context: ChartGenerationContext): Plot.PlotOptions {
  // For now, we only support bar charts for single measure scenarios
  // TODO: Add line charts, scatter plots, etc. as needed
  
  if (analysis.hasXMeasure || analysis.hasYMeasure) {
    return barChart(context);
  }

  // Fallback - this shouldn't happen since we check hasMeasure above
  throw new Error('Unsupported field combination');
}

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