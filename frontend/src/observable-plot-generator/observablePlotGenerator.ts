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
  
  // We allow dimension-only continuous charts (tick-strip/scatter), so do not require measures here.

  try {
    // Multi-measure on the same axis -> grid of bar charts (preferred over cartesian pairing)
    if (analysis.isMultiMeasure && !analysis.hasMixedAxes) {
      return multiMeasureBarChart(context);
    }
    
    // If both axes have at least one candidate (measure or dimension), build a cartesian pairing grid
    const xCandidates = [...analysis.xMeasures, ...analysis.xDimensions];
    const yCandidates = [...analysis.yMeasures, ...analysis.yDimensions];

    if (xCandidates.length > 0 && yCandidates.length > 0) {
      return generateCartesianGrid(context, analysis, xCandidates, yCandidates);
    }

    // Otherwise, generate single chart or simple multi on one axis
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
 * Build a cartesian pairing grid between xCandidates and yCandidates.
 * - If both are measures → scatter by their measure columns
 * - If one is measure and other is dimension → line chart
 * - If both are dimensions → scatter
 * Uses CSS grid with positions. For now, non-bar charts use 'fr' sizing.
 */
function generateCartesianGrid(
  context: ChartGenerationContext,
  analysis: FieldAnalysis,
  xCandidates: any[],
  yCandidates: any[]
): PlotResult {
  const { queryResult } = context;
  const data = queryResult.rows;

  // Compute shared domains for any measures used in the grid
  const sharedMeasureDomains = computeSharedMeasureDomains(data, xCandidates, yCandidates);

  const plots: Array<{
    id: string;
    title: string;
    options: Plot.PlotOptions;
    position: { row: number; col: number };
  }> = [];

  for (let r = 0; r < yCandidates.length; r++) {
    for (let c = 0; c < xCandidates.length; c++) {
      const xField = xCandidates[c];
      const yField = yCandidates[r];

      const xIsMeasure = xField.type === 'measure';
      const yIsMeasure = yField.type === 'measure';
      const xLabel = xIsMeasure
        ? getResultColumnName({ ...xField, aggregation: xField.aggregation || 'sum' })
        : xField.columnName;
      const yLabel = yIsMeasure
        ? getResultColumnName({ ...yField, aggregation: yField.aggregation || 'sum' })
        : yField.columnName;

      let options: Plot.PlotOptions;
      let title = `${yLabel} vs ${xLabel}`;

      if (xIsMeasure && yIsMeasure) {
        // measure vs measure → scatter
        options = scatterChart(data, xLabel, yLabel, { x: xLabel, y: yLabel });
        // Apply shared domains for both measures
        const xDomain = sharedMeasureDomains[xLabel];
        const yDomain = sharedMeasureDomains[yLabel];
        if (xDomain) {
          options.x = { ...(options.x || {}), domain: xDomain } as any;
        }
        if (yDomain) {
          options.y = { ...(options.y || {}), domain: yDomain } as any;
        }
      } else if (xIsMeasure && !yIsMeasure) {
        // measure on x, dimension on y → line along dimension
        options = lineChart(data, yLabel, xLabel, { x: yLabel, y: xLabel });
        // Apply shared domain for the x measure
        const xDomain = sharedMeasureDomains[xLabel];
        if (xDomain) {
          options.x = { ...(options.x || {}), domain: xDomain } as any;
        }
      } else if (!xIsMeasure && yIsMeasure) {
        // dimension on x, measure on y → line
        options = lineChart(data, xLabel, yLabel, { x: xLabel, y: yLabel });
        // Apply shared domain for the y measure
        const yDomain = sharedMeasureDomains[yLabel];
        if (yDomain) {
          options.y = { ...(options.y || {}), domain: yDomain } as any;
        }
      } else {
        // both dimensions → scatter
        options = scatterChart(data, xLabel, yLabel, { x: xLabel, y: yLabel });
      }

      plots.push({ id: `cell-${r}-${c}`, title, options, position: { row: r, col: c } });
    }
  }

  return {
    library: 'observable-plot',
    plots,
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

/**
 * Compute shared numeric domains for all measures used across a grid.
 * Includes 0 and adds 10% headroom at the top, similar to bar charts.
 */
function computeSharedMeasureDomains(
  data: any[],
  xCandidates: any[],
  yCandidates: any[]
): Record<string, [number, number]> {
  const measures: string[] = [];

  const addMeasure = (field: any) => {
    if (field?.type === 'measure') {
      const name = getResultColumnName({ ...field, aggregation: field.aggregation || 'sum' } as any);
      if (!measures.includes(name)) measures.push(name);
    }
  };

  xCandidates.forEach(addMeasure);
  yCandidates.forEach(addMeasure);

  const domains: Record<string, [number, number]> = {};
  measures.forEach((measureName) => {
    const values = data
      .map((row) => row[measureName])
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (values.length === 0) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const lower = Math.min(0, min);
    const upper = max <= 0 ? 0 : max * 1.1; // clamp to 0 if non-positive
    domains[measureName] = [lower, upper];
  });

  return domains;
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