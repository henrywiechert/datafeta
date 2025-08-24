import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from '../types';
import { FieldAnalysis } from '../analysis/fieldAnalysis';
import { barChart } from '../chartTypes/barChart';
import { tickStrip } from '../chartTypes/tickStrip';
import { lineChart } from '../chartTypes/lineChart';
import { scatterChart } from '../chartTypes/scatterChart';
import { getResultColumnName } from '../../utils/fieldUtils';

export function generateScatterPlot(analysis: FieldAnalysis, context: ChartGenerationContext): Plot.PlotOptions {
  const { queryResult } = context;
  const data = queryResult?.rows || [];
  const xMeasure = analysis.xMeasures[0];
  const yMeasure = analysis.yMeasures[0];
  const xFieldForName = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' };
  const yFieldForName = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' };
  const xColumnName = getResultColumnName(xFieldForName as any);
  const yColumnName = getResultColumnName(yFieldForName as any);
  return {
    width: 400,
    height: 300,
    x: { label: xColumnName, grid: true },
    y: { label: yColumnName, grid: true },
    marks: [
      Plot.dot(data, { x: xColumnName, y: yColumnName, fill: 'steelblue', r: 4 }),
      Plot.ruleX([0]),
      Plot.ruleY([0]),
    ],
  };
}

export function generateChartOptions(analysis: FieldAnalysis, context: ChartGenerationContext): PlotResult {
  const { queryResult } = context;
  const data = queryResult.rows;

  const xDims = analysis.xDimensions || [];
  const yDims = analysis.yDimensions || [];
  // Early: single continuous measure on one axis with no dimensions on the other → single-bar chart
  if (analysis.hasXMeasure && !analysis.hasYMeasure && yDims.length === 0) {
    return { library: 'observable-plot', options: barChart(context), layout: { type: 'single' } };
  }
  if (analysis.hasYMeasure && !analysis.hasXMeasure && xDims.length === 0) {
    return { library: 'observable-plot', options: barChart(context), layout: { type: 'single' } };
  }
  const xDiscreteDims = xDims.filter((d: any) => d.flavour === 'discrete');
  const yDiscreteDims = yDims.filter((d: any) => d.flavour === 'discrete');
  const xContinuousDims = xDims.filter((d: any) => d.flavour === 'continuous');
  const yContinuousDims = yDims.filter((d: any) => d.flavour === 'continuous');

  if (analysis.hasXMeasure && !analysis.hasYMeasure) {
    if (yContinuousDims.length > 0) {
      const yDimCol = yContinuousDims[0].columnName;
      const xMeasure = analysis.xMeasures[0];
      const xMeasureCol = getResultColumnName({ ...xMeasure, aggregation: xMeasure.aggregation || 'sum' } as any);
      return { library: 'observable-plot', options: lineChart(data, yDimCol, xMeasureCol, { x: yDimCol, y: xMeasureCol }), layout: { type: 'single' } };
    }
    if (yDiscreteDims.length > 0 || yDims.length > 0) {
      return { library: 'observable-plot', options: barChart(context), layout: { type: 'single' } };
    }
  }

  if (analysis.hasYMeasure && !analysis.hasXMeasure) {
    if (xContinuousDims.length > 0) {
      const xDimCol = xContinuousDims[0].columnName;
      const yMeasure = analysis.yMeasures[0];
      const yMeasureCol = getResultColumnName({ ...yMeasure, aggregation: yMeasure.aggregation || 'sum' } as any);
      return { library: 'observable-plot', options: lineChart(data, xDimCol, yMeasureCol, { x: xDimCol, y: yMeasureCol }), layout: { type: 'single' } };
    }
    if (xDiscreteDims.length > 0 || xDims.length > 0) {
      return { library: 'observable-plot', options: barChart(context), layout: { type: 'single' } };
    }
  }

  const singleXDim = analysis.hasXDimension && xContinuousDims.length === 1 && yDims.length === 0;
  const singleYDim = analysis.hasYDimension && yContinuousDims.length === 1 && xDims.length === 0;
  if (singleXDim) {
    const dimCol = analysis.xDimensions[0].columnName;
    // If opposite axis has discrete dimension(s), treat them as categories (mirroring bar chart behavior)
    const category = yDims.filter((d: any) => d.flavour === 'discrete').slice(-1)[0]?.columnName;
    return { library: 'observable-plot', options: tickStrip(context, 'x', dimCol, category), layout: { type: 'single' } };
  }
  if (singleYDim) {
    const dimCol = analysis.yDimensions[0].columnName;
    const category = xDims.filter((d: any) => d.flavour === 'discrete').slice(-1)[0]?.columnName;
    return { library: 'observable-plot', options: tickStrip(context, 'y', dimCol, category), layout: { type: 'single' } };
  }

  const bothDims = analysis.hasXDimension && analysis.hasYDimension && analysis.xDimensions.length > 0 && analysis.yDimensions.length > 0;
  if (bothDims && !analysis.hasMeasure) {
    const xContinuousDims = xDims.filter((d: any) => d.flavour === 'continuous');
    const yContinuousDims = yDims.filter((d: any) => d.flavour === 'continuous');
    const xDiscreteDims = xDims.filter((d: any) => d.flavour === 'discrete');
    const yDiscreteDims = yDims.filter((d: any) => d.flavour === 'discrete');

    // Continuous on X, discrete on Y → tick-strip along X, categorized by Y
    if (xContinuousDims.length > 0 && yContinuousDims.length === 0 && yDiscreteDims.length > 0) {
      const xDimCol = xContinuousDims[0].columnName;
      const categoryCol = yDiscreteDims.slice(-1)[0].columnName;
      return { library: 'observable-plot', options: tickStrip(context, 'x', xDimCol, categoryCol), layout: { type: 'single' } };
    }
    // Continuous on Y, discrete on X → tick-strip along Y, categorized by X
    if (yContinuousDims.length > 0 && xContinuousDims.length === 0 && xDiscreteDims.length > 0) {
      const yDimCol = yContinuousDims[0].columnName;
      const categoryCol = xDiscreteDims.slice(-1)[0].columnName;
      return { library: 'observable-plot', options: tickStrip(context, 'y', yDimCol, categoryCol), layout: { type: 'single' } };
    }
    // Both continuous → scatter
    if (xContinuousDims.length > 0 && yContinuousDims.length > 0) {
      const xDimCol = xContinuousDims[0].columnName;
      const yDimCol = yContinuousDims[0].columnName;
      return { library: 'observable-plot', options: scatterChart(data, xDimCol, yDimCol, { x: xDimCol, y: yDimCol }), layout: { type: 'single' } };
    }
    // Both discrete → simple dot plot (categorical scatter)
    if (xDiscreteDims.length > 0 && yDiscreteDims.length > 0) {
      const xCat = xDiscreteDims[0].columnName;
      const yCat = yDiscreteDims[0].columnName;
      return {
        library: 'observable-plot',
        options: {
          x: { label: xCat },
          y: { label: yCat },
          marks: [Plot.dot(data, { x: xCat, y: yCat, fill: 'steelblue', r: 2 })],
        },
        layout: { type: 'single' },
      };
    }
  }

  const hasMeasureOnlyX = analysis.hasXMeasure && !analysis.hasYMeasure && analysis.hasYDimension;
  const hasMeasureOnlyY = analysis.hasYMeasure && !analysis.hasXMeasure && analysis.hasXDimension;
  if (hasMeasureOnlyX) {
    const xMeasure = analysis.xMeasures[0];
    const yDim = analysis.yDimensions[0];
    const xMeasureCol = getResultColumnName({ ...xMeasure, aggregation: xMeasure.aggregation || 'sum' } as any);
    const yDimCol = yDim.columnName;
    return { library: 'observable-plot', options: lineChart(data, yDimCol, xMeasureCol, { x: yDimCol, y: xMeasureCol }), layout: { type: 'single' } };
  }
  if (hasMeasureOnlyY) {
    const yMeasure = analysis.yMeasures[0];
    const xDim = analysis.xDimensions[0];
    const yMeasureCol = getResultColumnName({ ...yMeasure, aggregation: yMeasure.aggregation || 'sum' } as any);
    const xDimCol = xDim.columnName;
    return { library: 'observable-plot', options: lineChart(data, xDimCol, yMeasureCol, { x: xDimCol, y: yMeasureCol }), layout: { type: 'single' } };
  }

  const multiXDim = analysis.hasXDimension && analysis.xDimensions.length > 1 && !analysis.hasYDimension && !analysis.hasMeasure;
  const multiYDim = analysis.hasYDimension && analysis.yDimensions.length > 1 && !analysis.hasXDimension && !analysis.hasMeasure;
  if (multiXDim) {
    const plots = analysis.xDimensions.map((dim: any, i: number) => ({ id: `x-dim-${i}`, title: dim.columnName, position: { row: 0, col: i }, options: tickStrip(context, 'x', dim.columnName) }));
    return { library: 'observable-plot', plots, layout: { type: 'grid', columns: plots.length, rows: 1, columnSizes: Array.from({ length: plots.length }, () => 'fr'), rowSizes: ['fr'] } };
  }
  if (multiYDim) {
    const plots = analysis.yDimensions.map((dim: any, i: number) => ({ id: `y-dim-${i}`, title: dim.columnName, position: { row: i, col: 0 }, options: tickStrip(context, 'y', dim.columnName) }));
    return { library: 'observable-plot', plots, layout: { type: 'grid', columns: 1, rows: plots.length, columnSizes: ['fr'], rowSizes: Array.from({ length: plots.length }, () => 'fr') } };
  }

  return { library: 'observable-plot', options: { marks: [Plot.text(['Unsupported field combination'], { frameAnchor: 'middle', fontSize: 14, fill: 'gray' })] }, layout: { type: 'single' } };
}


