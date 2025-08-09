import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from './types';
import { barChart } from './chartTypes/barChart';

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
    // Generate chart based on field analysis
    const plotOptions = generateChartOptions(analysis, context);
    
    return {
      library: 'observable-plot',
      options: plotOptions,
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
}

function analyzeFields(xFields: any[], yFields: any[]): FieldAnalysis {
  const xMeasures = xFields.filter(f => f.type === 'measure');
  const yMeasures = yFields.filter(f => f.type === 'measure');
  const xDimensions = xFields.filter(f => f.type === 'dimension');
  const yDimensions = yFields.filter(f => f.type === 'dimension');

  return {
    hasMeasure: xMeasures.length > 0 || yMeasures.length > 0,
    hasXMeasure: xMeasures.length > 0,
    hasYMeasure: yMeasures.length > 0,
    hasXDimension: xDimensions.length > 0,
    hasYDimension: yDimensions.length > 0,
    xMeasures,
    yMeasures,
    xDimensions,
    yDimensions,
  };
}

/**
 * Generate chart options based on simple field analysis
 */
function generateChartOptions(analysis: FieldAnalysis, context: ChartGenerationContext): Plot.PlotOptions {
  // For now, we only support bar charts
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
  };
}