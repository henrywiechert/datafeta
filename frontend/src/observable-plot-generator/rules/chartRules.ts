import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from '../types';
import { FieldAnalysis } from '../analysis/fieldAnalysis';
import { barUnified } from '../chartTypes/barUnified';
import { tickStrip } from '../chartTypes/tickStrip';
import { lineChart } from '../chartTypes/lineChart';
import { scatterChart } from '../chartTypes/scatterChart';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';

export function generateScatterPlot(
  analysis: FieldAnalysis,
  context: ChartGenerationContext,
  labelCfg?: { labelFields: any[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number }
): Plot.PlotOptions {
  const { queryResult, colorField, colorScheme, colorBias, sizeField, sizeRange, manualSize } = context;
  const data = queryResult?.rows || [];
  const xMeasure = analysis.xMeasures[0];
  const yMeasure = analysis.yMeasures[0];
  const xFieldForName = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' };
  const yFieldForName = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' };
  const xColumnName = getResultColumnName(xFieldForName as any);
  const yColumnName = getResultColumnName(yFieldForName as any);

  // Delegate to shared scatterChart helper so color & size logic stays consistent
  return scatterChart(
    data,
    xColumnName,
    yColumnName,
    { x: xColumnName, y: yColumnName },
    colorField,
    colorScheme,
    colorBias,
    context.manualColor,
    sizeField,
    sizeRange,
    manualSize,
    labelCfg
  );
}

export function generateChartOptions(
  analysis: FieldAnalysis,
  context: ChartGenerationContext,
  labelCfg?: { labelFields: any[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number }
): PlotResult {
  const { queryResult, colorField, colorScheme, sizeField, sizeRange, manualSize } = context;
  const data = queryResult.rows;

  const xDims = analysis.xDimensions || [];
  const yDims = analysis.yDimensions || [];
  // Helper to decide if we should render a bar chart for single-axis measure scenarios without continuous opposition
  function qualifiesForBarChart(): boolean {
    // Only one side has measures
    const singleAxisMeasure = (analysis.hasXMeasure && !analysis.hasYMeasure) || (analysis.hasYMeasure && !analysis.hasXMeasure);
    if (!singleAxisMeasure) return false;
    // If mixed axes (both measures) handled elsewhere
    if (analysis.hasMixedAxes) return false;
    // Determine opposing axis dims & whether any is continuous
    if (analysis.hasXMeasure && !analysis.hasYMeasure) {
      const anyContinuousOpp = yDims.some((d: any) => d.flavour === 'continuous');
      if (anyContinuousOpp) return false; // line or tick-strip pathways handle this
      return true; // either discrete dims or none -> bar
    }
    if (analysis.hasYMeasure && !analysis.hasXMeasure) {
      const anyContinuousOpp = xDims.some((d: any) => d.flavour === 'continuous');
      if (anyContinuousOpp) return false;
      return true;
    }
    return false;
  }

  if (qualifiesForBarChart()) {
    return barUnified(context, labelCfg);
  }
  const xContinuousDims = xDims.filter((d: any) => d.flavour === 'continuous');
  const yContinuousDims = yDims.filter((d: any) => d.flavour === 'continuous');

  if (analysis.hasXMeasure && !analysis.hasYMeasure && yContinuousDims.length > 0) {
    const yDim = yContinuousDims[0];
    const yDimCol = getResultColumnName(yDim);
    const xMeasure = analysis.xMeasures[0];
    const xMeasureCol = getResultColumnName({ ...xMeasure, aggregation: xMeasure.aggregation || 'sum' } as any);
    return { 
      library: 'observable-plot', 
      options: lineChart(
        data,
        yDimCol,
        xMeasureCol,
        { x: getFieldDisplayName(yDim), y: xMeasureCol },
        undefined,
        colorField,
        colorScheme,
        context.colorBias,
        context.manualColor,
        sizeField,
        sizeRange,
        manualSize,
        labelCfg
      ), 
      layout: { type: 'single' } 
    };
  }
  if (analysis.hasYMeasure && !analysis.hasXMeasure && xContinuousDims.length > 0) {
    const xDim = xContinuousDims[0];
    const xDimCol = getResultColumnName(xDim);
    const yMeasure = analysis.yMeasures[0];
    const yMeasureCol = getResultColumnName({ ...yMeasure, aggregation: yMeasure.aggregation || 'sum' } as any);
    return { 
      library: 'observable-plot', 
      options: lineChart(
        data,
        xDimCol,
        yMeasureCol,
        { x: getFieldDisplayName(xDim), y: yMeasureCol },
        undefined,
        colorField,
        colorScheme,
        context.colorBias,
        context.manualColor,
        sizeField,
        sizeRange,
        manualSize,
        labelCfg
      ), 
      layout: { type: 'single' } 
    };
  }

  const singleXDim = analysis.hasXDimension && xContinuousDims.length === 1 && yDims.length === 0;
  const singleYDim = analysis.hasYDimension && yContinuousDims.length === 1 && xDims.length === 0;
  if (singleXDim) {
    const dimCol = analysis.xDimensions[0].columnName;
    // If opposite axis has discrete dimension(s), treat them as categories (mirroring bar chart behavior)
    // Check categoryAxisDescriptor first (from faceting), then fall back to finding in yDims
    const category = (context.categoryAxisDescriptor?.axis === 'y' ? context.categoryAxisDescriptor.columnName : null)
      || yDims.filter((d: any) => d.flavour === 'discrete').slice(-1)[0]?.columnName;
    return { library: 'observable-plot', options: tickStrip(context, 'x', dimCol, category), layout: { type: 'single' } };
  }
  if (singleYDim) {
    const dimCol = analysis.yDimensions[0].columnName;
    // Check categoryAxisDescriptor first (from faceting), then fall back to finding in xDims
    const category = (context.categoryAxisDescriptor?.axis === 'x' ? context.categoryAxisDescriptor.columnName : null)
      || xDims.filter((d: any) => d.flavour === 'discrete').slice(-1)[0]?.columnName;
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
      const xDim = xContinuousDims[0];
      const xDimCol = getResultColumnName(xDim);
      const yDim = yDiscreteDims.slice(-1)[0];
      // Check categoryAxisDescriptor first (from faceting), then fall back to finding in yDiscreteDims
      const categoryCol = (context.categoryAxisDescriptor?.axis === 'y' ? context.categoryAxisDescriptor.columnName : null)
        || getResultColumnName(yDim);
      return { 
        library: 'observable-plot', 
        options: tickStrip(context, 'x', xDimCol, categoryCol, { 
          dimension: getFieldDisplayName(xDim), 
          category: categoryCol 
        }), 
        layout: { type: 'single' } 
      };
    }
    // Continuous on Y, discrete on X → tick-strip along Y, categorized by X
    if (yContinuousDims.length > 0 && xContinuousDims.length === 0 && xDiscreteDims.length > 0) {
      const yDim = yContinuousDims[0];
      const yDimCol = getResultColumnName(yDim);
      const xDim = xDiscreteDims.slice(-1)[0];
      // Check categoryAxisDescriptor first (from faceting), then fall back to finding in xDiscreteDims
      const categoryCol = (context.categoryAxisDescriptor?.axis === 'x' ? context.categoryAxisDescriptor.columnName : null)
        || getResultColumnName(xDim);
      return { 
        library: 'observable-plot', 
        options: tickStrip(context, 'y', yDimCol, categoryCol, { 
          dimension: getFieldDisplayName(yDim), 
          category: categoryCol 
        }), 
        layout: { type: 'single' } 
      };
    }
    // Both continuous → scatter
    if (xContinuousDims.length > 0 && yContinuousDims.length > 0) {
      const xDimCol = getResultColumnName(xContinuousDims[0]);
      const yDimCol = getResultColumnName(yContinuousDims[0]);
      return {
        library: 'observable-plot',
        options: scatterChart(
          data,
          xDimCol,
          yDimCol,
          { x: xDimCol, y: yDimCol },
          colorField,
          colorScheme,
          context.colorBias,
          context.manualColor,
          sizeField,
          sizeRange,
          manualSize,
          labelCfg
        ),
        layout: { type: 'single' }
      };
    }
    // Both discrete → simple dot plot (categorical scatter)
    if (xDiscreteDims.length > 0 && yDiscreteDims.length > 0) {
      const xCat = getResultColumnName(xDiscreteDims[0]);
      const yCat = getResultColumnName(yDiscreteDims[0]);
      const dotConfig: any = {
        x: { value: xCat, label: xCat },
        y: { value: yCat, label: yCat },
        fill: 'steelblue',
        r: 2,
        channels: {
          [xCat]: { value: xCat, label: xCat },
          [yCat]: { value: yCat, label: yCat },
        }
      };
      
      // Add color and size channels if present
      if (colorField) {
        const colorColumnName = getResultColumnName(colorField);
        dotConfig.fill = colorColumnName;
        dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };
      }
      
      if (sizeField) {
        const sizeColumnName = getResultColumnName(sizeField);
        dotConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: sizeField.columnName };
        // Note: size scaling for discrete charts not implemented yet
      }
      
      // Update tooltip format
      const tipFormat: any = { [xCat]: true, [yCat]: true, x: false, y: false, fill: false, r: false };
      if (colorField) {
        tipFormat[colorField.columnName] = true;
      }
      if (sizeField) {
        tipFormat[sizeField.columnName] = true;
      }
      
      return {
        library: 'observable-plot',
        options: {
          x: { label: xCat },
          y: { label: yCat },
          marks: [Plot.dot(data, {
            ...dotConfig,
            tip: { pointer: 'x', preferredAnchor: 'top-right', format: tipFormat }
          })],
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
    const yDimCol = getResultColumnName(yDim);
    return { 
      library: 'observable-plot', 
      options: lineChart(
        data,
        yDimCol,
        xMeasureCol,
        { x: getFieldDisplayName(yDim), y: xMeasureCol },
        undefined,
        colorField,
        colorScheme,
        context.colorBias,
        context.manualColor,
        sizeField,
        sizeRange,
        manualSize,
        labelCfg
      ), 
      layout: { type: 'single' } 
    };
  }
  if (hasMeasureOnlyY) {
    const yMeasure = analysis.yMeasures[0];
    const xDim = analysis.xDimensions[0];
    const yMeasureCol = getResultColumnName({ ...yMeasure, aggregation: yMeasure.aggregation || 'sum' } as any);
    const xDimCol = getResultColumnName(xDim);
    return { 
      library: 'observable-plot', 
      options: lineChart(
        data,
        xDimCol,
        yMeasureCol,
        { x: getFieldDisplayName(xDim), y: yMeasureCol },
        undefined,
        colorField,
        colorScheme,
        context.colorBias,
        context.manualColor,
        sizeField,
        sizeRange,
        manualSize,
        labelCfg
      ), 
      layout: { type: 'single' } 
    };
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


