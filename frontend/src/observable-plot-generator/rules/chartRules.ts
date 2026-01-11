import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from '../types';
import { FieldAnalysis } from '../analysis/fieldAnalysis';
import { barUnified } from '../chartTypes/barUnified';
import { tickStrip } from '../chartTypes/tickStrip';
import { lineChart } from '../chartTypes/lineChart';
import { scatterChart } from '../chartTypes/scatterChart';
import { barChart } from '../chartTypes/barChart';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { BAR_STEP_PX, MIN_BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { Field } from '../../types';

interface SizeOptions {
  intrinsicWidth?: number | 'fr';
  intrinsicHeight?: number | 'fr';
  minWidth?: number;
  minHeight?: number;
}

/**
 * Configuration for chart labels.
 */
export interface LabelConfig {
  labelFields: Field[];
  labelsEnabled: boolean;
  samplingStrategy: 'auto' | 'all' | 'sample';
  samplingThreshold: number;
  sampleEvery: number;
}

/**
 * Helper to wrap a single Plot.PlotOptions into a 1x1 grid PlotResult.
 * Eliminates the legacy 'single' layout type.
 * Accepts optional size parameters for intrinsic sizing and resize constraints.
 */
function wrapAs1x1Grid(
  options: Plot.PlotOptions, 
  id: string = 'plot', 
  title: string = '',
  sizeOptions?: SizeOptions
): PlotResult {
  const intrinsicWidth = sizeOptions?.intrinsicWidth ?? 'fr';
  const intrinsicHeight = sizeOptions?.intrinsicHeight ?? 'fr';
  
  return {
    library: 'observable-plot',
    plots: [{
      id,
      title,
      options,
      position: { row: 0, col: 0 }
    }],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: [intrinsicWidth],
      rowSizes: [intrinsicHeight],
      // Minimum sizes for resize constraints (based on categories * MIN_BAR_STEP_PX)
      minColumnSizes: sizeOptions?.minWidth ? [sizeOptions.minWidth] : undefined,
      minRowSizes: sizeOptions?.minHeight ? [sizeOptions.minHeight] : undefined,
    }
  };
}

/**
 * Helper to wrap a tick strip with proper intrinsic and minimum sizing.
 * Calculates sizes based on category count.
 */
function wrapTickStripAs1x1Grid(
  context: ChartGenerationContext,
  options: Plot.PlotOptions, 
  orientation: 'x' | 'y',
  id: string,
  title: string,
  categoryColumn?: string
): PlotResult {
  // Count categories to determine sizing
  const data = context.queryResult?.rows || [];
  let categoryCount = 1;
  if (categoryColumn) {
    const uniqueCategories = new Set(data.map(row => row[categoryColumn]));
    categoryCount = Math.max(1, uniqueCategories.size);
  }
  
  const intrinsicSize = Math.max(BAR_STEP_PX, categoryCount * BAR_STEP_PX);
  const minSize = Math.max(MIN_BAR_STEP_PX, categoryCount * MIN_BAR_STEP_PX);
  
  // For x-orientation (tickX), height is fixed; for y-orientation (tickY), width is fixed
  const sizeOptions: SizeOptions = orientation === 'x'
    ? { intrinsicHeight: intrinsicSize, minHeight: minSize }
    : { intrinsicWidth: intrinsicSize, minWidth: minSize };
  
  return wrapAs1x1Grid(options, id, title, sizeOptions);
}

/**
 * Determines if the field configuration qualifies for a bar chart.
 * Bar chart: continuous measures on exactly one axis AND the other axis has no continuous fields.
 */
function qualifiesForBarChart(
  xContinuousMeasures: Field[],
  yContinuousMeasures: Field[],
  xContinuousDims: Field[],
  yContinuousDims: Field[]
): boolean {
  const xHasContinuousMeasure = xContinuousMeasures.length > 0;
  const yHasContinuousMeasure = yContinuousMeasures.length > 0;
  
  // Need measures on exactly one axis (not both, not neither)
  if (!(xHasContinuousMeasure !== yHasContinuousMeasure)) return false;
  
  // Check that the opposite axis has no continuous fields (neither continuous measures nor continuous dimensions)
  if (xHasContinuousMeasure) {
    const yHasContinuous = yContinuousMeasures.length > 0 || yContinuousDims.length > 0;
    return !yHasContinuous;
  } else {
    const xHasContinuous = xContinuousMeasures.length > 0 || xContinuousDims.length > 0;
    return !xHasContinuous;
  }
}

export function generateChartOptions(
  analysis: FieldAnalysis,
  context: ChartGenerationContext,
  labelCfg?: LabelConfig
): PlotResult {
  const { queryResult, colorField, colorScheme, sizeField, sizeRange, manualSize, tooltipFields } = context;
  const data = queryResult.rows;

  const xDims = analysis.xDimensions || [];
  const yDims = analysis.yDimensions || [];

  const xContinuousDims = xDims.filter((d) => d.flavour === 'continuous');
  const yContinuousDims = yDims.filter((d) => d.flavour === 'continuous');
  const xContinuousMeasures = (analysis.xMeasures || []).filter((m) => m.flavour === 'continuous');
  const yContinuousMeasures = (analysis.yMeasures || []).filter((m) => m.flavour === 'continuous');
  const xDiscreteDims = xDims.filter((d) => d.flavour === 'discrete');
  const yDiscreteDims = yDims.filter((d) => d.flavour === 'discrete');

  // Special case: continuous dimension + continuous measure on the SAME axis,
  // with the opposite axis empty. Expected layout:
  // - a tick-strip for the dimension
  // - a single bar for the measure
  // stacked horizontally (X-axis case) or vertically (Y-axis case).
  const hasSameAxisMixOnX =
    xContinuousDims.length > 0 &&
    xContinuousMeasures.length > 0 &&
    !analysis.hasYMeasure &&
    !analysis.hasYDimension;

  const hasSameAxisMixOnY =
    yContinuousDims.length > 0 &&
    yContinuousMeasures.length > 0 &&
    !analysis.hasXMeasure &&
    !analysis.hasXDimension;

  if (hasSameAxisMixOnX || hasSameAxisMixOnY) {
    const onX = hasSameAxisMixOnX;
    const dim = onX ? xContinuousDims[0] : yContinuousDims[0];
    const measure = onX ? xContinuousMeasures[0] : yContinuousMeasures[0];

    const dimCol = getResultColumnName(dim);
    const tickOptions = tickStrip(
      context,
      onX ? 'x' : 'y',
      dimCol
    );

    // Build a minimal bar context that isolates the continuous measure on its axis
    // so we render a single aggregated bar (no categories).
    const barContext: ChartGenerationContext = {
      ...context,
      xFields: onX ? [measure] : [],
      yFields: onX ? [] : [measure],
    };
    const barOptions = barChart(barContext, labelCfg);

    const measureWithAgg = { ...measure, aggregation: measure.aggregation || 'sum' } as Field;
    const measureName = getResultColumnName(measureWithAgg);

    const plots = onX
      ? [
          {
            id: 'dim-tick',
            title: dim.columnName,
            options: tickOptions,
            position: { row: 0, col: 0 },
          },
          {
            id: 'measure-bar',
            title: measureName,
            options: barOptions,
            position: { row: 0, col: 1 },
          },
        ]
      : [
          {
            id: 'dim-tick',
            title: dim.columnName,
            options: tickOptions,
            position: { row: 0, col: 0 },
          },
          {
            id: 'measure-bar',
            title: measureName,
            options: barOptions,
            position: { row: 1, col: 0 },
          },
        ];

    return {
      library: 'observable-plot',
      plots,
      layout: {
        type: 'grid',
        columns: onX ? 2 : 1,
        rows: onX ? 1 : 2,
        columnSizes: onX ? ['fr', 'fr'] : ['fr'],
        rowSizes: onX ? ['fr'] : ['fr', 'fr'],
      },
    };
  }

  if (qualifiesForBarChart(xContinuousMeasures, yContinuousMeasures, xContinuousDims, yContinuousDims)) {
    return barUnified(context, labelCfg);
  }

  if (analysis.hasXMeasure && !analysis.hasYMeasure && yContinuousDims.length > 0) {
    const yDim = yContinuousDims[0];
    const yDimCol = getResultColumnName(yDim);
    const xMeasure = analysis.xMeasures[0];
    const xMeasureWithAgg = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' } as Field;
    const xMeasureCol = getResultColumnName(xMeasureWithAgg);
    return wrapAs1x1Grid(
      lineChart(
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
        labelCfg,
        tooltipFields
      ),
      'line-chart',
      `${yDim.columnName} vs ${xMeasure.columnName}`
    );
  }
  if (analysis.hasYMeasure && !analysis.hasXMeasure && xContinuousDims.length > 0) {
    const xDim = xContinuousDims[0];
    const xDimCol = getResultColumnName(xDim);
    const yMeasure = analysis.yMeasures[0];
    const yMeasureWithAgg = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' } as Field;
    const yMeasureCol = getResultColumnName(yMeasureWithAgg);
    return wrapAs1x1Grid(
      lineChart(
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
        labelCfg,
        tooltipFields
      ),
      'line-chart',
      `${xDim.columnName} vs ${yMeasure.columnName}`
    );
  }

  const singleXDim = analysis.hasXDimension && xContinuousDims.length === 1 && yDims.length === 0;
  const singleYDim = analysis.hasYDimension && yContinuousDims.length === 1 && xDims.length === 0;
  if (singleXDim) {
    // Use the continuous dimension, not analysis.xDimensions[0] which may include discrete dims
    const dim = xContinuousDims[0];
    const dimCol = getResultColumnName(dim);
    // If opposite axis has discrete dimension(s), treat them as categories (mirroring bar chart behavior)
    // Check categoryAxisDescriptor first (from faceting), then fall back to finding in yDims
    const category = (context.categoryAxisDescriptor?.axis === 'y' ? context.categoryAxisDescriptor.columnName : null)
      || yDiscreteDims.slice(-1)[0]?.columnName;
    return wrapTickStripAs1x1Grid(context, tickStrip(context, 'x', dimCol, category), 'x', 'tick-strip-x', dimCol, category);
  }
  if (singleYDim) {
    // Use the continuous dimension, not analysis.yDimensions[0] which may include discrete dims
    const dim = yContinuousDims[0];
    const dimCol = getResultColumnName(dim);
    // Check categoryAxisDescriptor first (from faceting), then fall back to finding in xDims
    const category = (context.categoryAxisDescriptor?.axis === 'x' ? context.categoryAxisDescriptor.columnName : null)
      || xDiscreteDims.slice(-1)[0]?.columnName;
    return wrapTickStripAs1x1Grid(context, tickStrip(context, 'y', dimCol, category), 'y', 'tick-strip-y', dimCol, category);
  }

  const bothDims = analysis.hasXDimension && analysis.hasYDimension && analysis.xDimensions.length > 0 && analysis.yDimensions.length > 0;
  if (bothDims && !analysis.hasMeasure) {
    // Continuous on X, discrete on Y → tick-strip along X, categorized by Y
    if (xContinuousDims.length > 0 && yContinuousDims.length === 0 && yDiscreteDims.length > 0) {
      const xDim = xContinuousDims[0];
      const xDimCol = getResultColumnName(xDim);
      const yDim = yDiscreteDims.slice(-1)[0];
      // Check categoryAxisDescriptor first (from faceting), then fall back to finding in yDiscreteDims
      const categoryCol = (context.categoryAxisDescriptor?.axis === 'y' ? context.categoryAxisDescriptor.columnName : null)
        || getResultColumnName(yDim);
      return wrapTickStripAs1x1Grid(
        context,
        tickStrip(context, 'x', xDimCol, categoryCol, { 
          dimension: getFieldDisplayName(xDim), 
          category: categoryCol 
        }),
        'x',
        'tick-strip-x-categorized',
        `${xDim.columnName} by ${yDim.columnName}`,
        categoryCol
      );
    }
    // Continuous on Y, discrete on X → tick-strip along Y, categorized by X
    if (yContinuousDims.length > 0 && xContinuousDims.length === 0 && xDiscreteDims.length > 0) {
      const yDim = yContinuousDims[0];
      const yDimCol = getResultColumnName(yDim);
      const xDim = xDiscreteDims.slice(-1)[0];
      // Check categoryAxisDescriptor first (from faceting), then fall back to finding in xDiscreteDims
      const categoryCol = (context.categoryAxisDescriptor?.axis === 'x' ? context.categoryAxisDescriptor.columnName : null)
        || getResultColumnName(xDim);
      return wrapTickStripAs1x1Grid(
        context,
        tickStrip(context, 'y', yDimCol, categoryCol, { 
          dimension: getFieldDisplayName(yDim), 
          category: categoryCol 
        }),
        'y',
        'tick-strip-y-categorized',
        `${yDim.columnName} by ${xDim.columnName}`,
        categoryCol
      );
    }
    // Both continuous → scatter
    if (xContinuousDims.length > 0 && yContinuousDims.length > 0) {
      const xDimCol = getResultColumnName(xContinuousDims[0]);
      const yDimCol = getResultColumnName(yContinuousDims[0]);
      return wrapAs1x1Grid(
        scatterChart(
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
          labelCfg,
          tooltipFields
        ),
        'scatter',
        `${xContinuousDims[0].columnName} vs ${yContinuousDims[0].columnName}`
      );
    }
    // Both discrete → simple dot plot (categorical scatter)
    if (xDiscreteDims.length > 0 && yDiscreteDims.length > 0) {
      const xCat = getResultColumnName(xDiscreteDims[0]);
      const yCat = getResultColumnName(yDiscreteDims[0]);
      const dotConfig: Plot.DotOptions = {
        x: xCat,
        y: yCat,
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
        dotConfig.channels = {
          ...dotConfig.channels,
          [colorField.columnName]: { value: colorColumnName, label: colorField.columnName }
        };
      }
      
      if (sizeField) {
        const sizeColumnName = getResultColumnName(sizeField);
        dotConfig.channels = {
          ...dotConfig.channels,
          [sizeField.columnName]: { value: sizeColumnName, label: sizeField.columnName }
        };
        // Note: size scaling for discrete charts not implemented yet
      }
      
      // Update tooltip format
      const tipFormat: Record<string, boolean> = { [xCat]: true, [yCat]: true, x: false, y: false, fill: false, r: false };
      if (colorField) {
        tipFormat[colorField.columnName] = true;
      }
      if (sizeField) {
        tipFormat[sizeField.columnName] = true;
      }
      
      return wrapAs1x1Grid(
        {
          x: { label: xCat },
          y: { label: yCat },
          marks: [Plot.dot(data, {
            ...dotConfig,
            tip: { pointer: 'x', preferredAnchor: 'top-right', format: tipFormat }
          })],
        },
        'dot-plot',
        `${xDiscreteDims[0].columnName} vs ${yDiscreteDims[0].columnName}`
      );
    }
  }

  const hasMeasureOnlyX = analysis.hasXMeasure && !analysis.hasYMeasure && analysis.hasYDimension;
  const hasMeasureOnlyY = analysis.hasYMeasure && !analysis.hasXMeasure && analysis.hasXDimension;
  if (hasMeasureOnlyX) {
    const xMeasure = analysis.xMeasures[0];
    const yDim = analysis.yDimensions[0];
    const xMeasureWithAgg = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' } as Field;
    const xMeasureCol = getResultColumnName(xMeasureWithAgg);
    const yDimCol = getResultColumnName(yDim);
    return wrapAs1x1Grid(
      lineChart(
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
        labelCfg,
        tooltipFields
      ),
      'line-chart',
      `${yDim.columnName} vs ${xMeasure.columnName}`
    );
  }
  if (hasMeasureOnlyY) {
    const yMeasure = analysis.yMeasures[0];
    const xDim = analysis.xDimensions[0];
    const yMeasureWithAgg = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' } as Field;
    const yMeasureCol = getResultColumnName(yMeasureWithAgg);
    const xDimCol = getResultColumnName(xDim);
    return wrapAs1x1Grid(
      lineChart(
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
        labelCfg,
        tooltipFields
      ),
      'line-chart',
      `${xDim.columnName} vs ${yMeasure.columnName}`
    );
  }

  const multiXDim = analysis.hasXDimension && analysis.xDimensions.length > 1 && !analysis.hasYDimension && !analysis.hasMeasure;
  const multiYDim = analysis.hasYDimension && analysis.yDimensions.length > 1 && !analysis.hasXDimension && !analysis.hasMeasure;
  if (multiXDim) {
    const plots = analysis.xDimensions.map((dim, i: number) => {
      const dimCol = getResultColumnName(dim);
      return { id: `x-dim-${i}`, title: dim.columnName, position: { row: 0, col: i }, options: tickStrip(context, 'x', dimCol) };
    });
    return { library: 'observable-plot', plots, layout: { type: 'grid', columns: plots.length, rows: 1, columnSizes: Array.from({ length: plots.length }, () => 'fr' as const), rowSizes: ['fr'] } };
  }
  if (multiYDim) {
    const plots = analysis.yDimensions.map((dim, i: number) => {
      const dimCol = getResultColumnName(dim);
      return { id: `y-dim-${i}`, title: dim.columnName, position: { row: i, col: 0 }, options: tickStrip(context, 'y', dimCol) };
    });
    return { library: 'observable-plot', plots, layout: { type: 'grid', columns: 1, rows: plots.length, columnSizes: ['fr'], rowSizes: Array.from({ length: plots.length }, () => 'fr' as const) } };
  }

  return wrapAs1x1Grid(
    { marks: [Plot.text(['Unsupported field combination'], { frameAnchor: 'middle', fontSize: 14, fill: 'gray' })] },
    'unsupported',
    'Unsupported field combination'
  );
}
