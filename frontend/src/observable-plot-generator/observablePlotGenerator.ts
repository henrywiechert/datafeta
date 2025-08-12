import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from './types';
import { barChart } from './chartTypes/barChart';
import { multiMeasureBarChart } from './chartTypes/multiMeasureBarChart';
import { getResultColumnName } from '../utils/fieldUtils';
import { tickStrip } from './chartTypes/tickStrip';
import { lineChart } from './chartTypes/lineChart';
import { scatterChart } from './chartTypes/scatterChart';

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
    // Check if we have measures on both X and Y axes -> scatter plot (single point)
    if (analysis.hasMixedAxes) {
      const plotOptions = generateScatterPlot(analysis, context);
      return {
        library: 'observable-plot',
        options: plotOptions,
        layout: { type: 'single' },
      };
    }
    
    // Check if we need multi-measure charts (same axis)
    if (analysis.isMultiMeasure) {
      return multiMeasureBarChart(context);
    }
    
    // Generate single chart or grid based on dimensions/measures
    const result = generateChartOptions(analysis, context);
    return result;

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
function generateChartOptions(analysis: FieldAnalysis, context: ChartGenerationContext): PlotResult {
  const { xFields, yFields, queryResult } = context;
  const data = queryResult.rows;

  // 1) Multi-measure path is already handled earlier

  // 2) Single continuous measure on one axis -> bar chart
  if ((analysis.hasXMeasure && !analysis.hasYMeasure) || (analysis.hasYMeasure && !analysis.hasXMeasure)) {
    return {
      library: 'observable-plot',
      options: barChart(context),
      layout: { type: 'single' },
    };
  }

  // 3) Continuous dimension only (single) -> tick-strip
  const singleXDim = analysis.hasXDimension && analysis.xDimensions.length === 1 && !analysis.hasYDimension;
  const singleYDim = analysis.hasYDimension && analysis.yDimensions.length === 1 && !analysis.hasXDimension;
  if (singleXDim) {
    const dimCol = analysis.xDimensions[0].columnName;
    return { library: 'observable-plot', options: tickStrip(context, 'x', dimCol), layout: { type: 'single' } };
  }
  if (singleYDim) {
    const dimCol = analysis.yDimensions[0].columnName;
    return { library: 'observable-plot', options: tickStrip(context, 'y', dimCol), layout: { type: 'single' } };
  }

  // 4) Continuous dimension on both axes -> scatter
  const bothDims = analysis.hasXDimension && analysis.hasYDimension && analysis.xDimensions.length > 0 && analysis.yDimensions.length > 0;
  if (bothDims && !analysis.hasMeasure) {
    const xDimCol = analysis.xDimensions[0].columnName;
    const yDimCol = analysis.yDimensions[0].columnName;
    return {
      library: 'observable-plot',
      options: scatterChart(data, xDimCol, yDimCol, { x: xDimCol, y: yDimCol }),
      layout: { type: 'single' },
    };
  }

  // 5) Continuous measure on one axis + continuous dimension on the other -> line chart
  const hasMeasureOnlyX = analysis.hasXMeasure && !analysis.hasYMeasure && analysis.hasYDimension;
  const hasMeasureOnlyY = analysis.hasYMeasure && !analysis.hasXMeasure && analysis.hasXDimension;
  if (hasMeasureOnlyX) {
    // measure on X vs dimension on Y -> line with x=dimension, y=measure (so line goes along dimension)
    const xMeasure = analysis.xMeasures[0];
    const yDim = analysis.yDimensions[0];
    const xMeasureCol = getResultColumnName({ ...xMeasure, aggregation: xMeasure.aggregation || 'sum' } as any);
    const yDimCol = yDim.columnName;
    return {
      library: 'observable-plot',
      options: lineChart(data, yDimCol, xMeasureCol, { x: yDimCol, y: xMeasureCol }),
      layout: { type: 'single' },
    };
  }
  if (hasMeasureOnlyY) {
    const yMeasure = analysis.yMeasures[0];
    const xDim = analysis.xDimensions[0];
    const yMeasureCol = getResultColumnName({ ...yMeasure, aggregation: yMeasure.aggregation || 'sum' } as any);
    const xDimCol = xDim.columnName;
    return {
      library: 'observable-plot',
      options: lineChart(data, xDimCol, yMeasureCol, { x: xDimCol, y: yMeasureCol }),
      layout: { type: 'single' },
    };
  }

  // 6) Multiple continuous dimensions on the same axis -> multiple charts (CSS grid)
  const multiXDim = analysis.hasXDimension && analysis.xDimensions.length > 1 && !analysis.hasYDimension && !analysis.hasMeasure;
  const multiYDim = analysis.hasYDimension && analysis.yDimensions.length > 1 && !analysis.hasXDimension && !analysis.hasMeasure;
  if (multiXDim) {
    const plots = analysis.xDimensions.map((dim: any, i: number) => ({
      id: `x-dim-${i}`,
      title: dim.columnName,
      position: { row: 0, col: i },
      options: tickStrip(context, 'x', dim.columnName),
    }));
    return {
      library: 'observable-plot',
      plots,
      layout: { type: 'grid', columns: plots.length, rows: 1, columnSizes: Array.from({ length: plots.length }, () => 'fr'), rowSizes: ['fr'] },
    };
  }
  if (multiYDim) {
    const plots = analysis.yDimensions.map((dim: any, i: number) => ({
      id: `y-dim-${i}`,
      title: dim.columnName,
      position: { row: i, col: 0 },
      options: tickStrip(context, 'y', dim.columnName),
    }));
    return {
      library: 'observable-plot',
      plots,
      layout: { type: 'grid', columns: 1, rows: plots.length, columnSizes: ['fr'], rowSizes: Array.from({ length: plots.length }, () => 'fr') },
    };
  }

  // Fallback to single message
  return {
    library: 'observable-plot',
    options: {
      marks: [
        Plot.text(['Unsupported field combination'], { frameAnchor: 'middle', fontSize: 14, fill: 'gray' }),
      ],
    },
    layout: { type: 'single' },
  };
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