import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import { LabelConfig, GanttZoomRange } from '../types';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { getFieldColumnName } from '../helpers/fields';
import { lineChart, verticalLineChart } from './lineChart';
import { scatterChart } from './scatterChart';
import { tickStrip } from './tickStrip';
import { boxPlot } from './boxPlot';
import { ganttChart } from './ganttChart';
import { buildCdfOptions } from './cdfChart';
import { buildHeatmapOptions } from './heatmapChart';
import { CellChartType, ChartTypeOverrides, resolveChartTypeForPair } from '../helpers/chartTypeResolver';
import { buildBarOptions, resolveMeasureAlias, computeBandPaddingFromSizeField, sortCategoriesByValue, Orientation } from './barCore';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';

// Types and helpers extracted to separate files
import { Domains, ChartContext, ChartHandler } from './cellChartTypes';
import { aggregateValues, resolveXYColumns, messageOptions, scatterForDimOnly, resolveColumnInData } from './cellChartHelpers';

// Re-export types for external consumers
export type { Domains, ChartContext, ChartHandler } from './cellChartTypes';

// ---------- Unified Bar Creation --------------------------------------------

/**
 * Create a bar chart with the specified orientation.
 * Consolidates the logic from createBarX and createBarY.
 */
function createBar(
  data: any[],
  measure: Field,
  categoryDimension: Field | null,
  orientation: Orientation,
  ctx: ChartContext
): Plot.PlotOptions {
  const measureName = resolveMeasureAlias(measure);
  
  // Extract value domain from shared domains if available
  const valueDomain = (ctx.sharedMeasureDomains && ctx.sharedMeasureDomains[measureName]) as [number, number] | undefined;
  
  // Get category column and domain
  const categoryColumn = categoryDimension ? getFieldColumnName(categoryDimension) : undefined;
  let categoriesDomain: string[] | undefined;
  
  if (categoryColumn) {
    const sharedCatDomain = (ctx.sharedMeasureDomains && (ctx.sharedMeasureDomains as any)[categoryColumn]) as any[] | undefined;
    categoriesDomain = sharedCatDomain && Array.isArray(sharedCatDomain) 
      ? sharedCatDomain 
      : Array.from(new Set(data.map((row) => row[categoryColumn])));
    
    // Apply sorting if specified
    if ((measure as any).barSortOrder && (measure as any).barSortOrder !== 'none') {
      categoriesDomain = sortCategoriesByValue(
        categoriesDomain,
        data,
        categoryColumn,
        measureName,
        (measure as any).barSortOrder
      );
    }
  }
  
  const dynamicPadding = computeBandPaddingFromSizeField(data, ctx.sizeField, {
    manualSize: ctx.manualSize,
  }) ?? 0.1;
  const colorColumn = ctx.colorField ? getResultColumnName(ctx.colorField) : undefined;
  const colorScale = ctx.colorField ? deriveColorScaleInfo(data, ctx.colorField, ctx.colorScheme, ctx.colorBias) : null;
  
  // Don't use valueDomainOverride for stacked bars (no category but has color)
  const useStackedDomain = !categoryColumn && colorColumn;
  
  return buildBarOptions({
    data,
    measureName,
    orientation,
    categoryColumn,
    categoryTickFormat: orientation === 'vertical' ? ctx.xTickFormat : ctx.yTickFormat,
    categoriesDomain,
    colorColumn,
    colorScale,
    bandPadding: dynamicPadding,
    zeroBaseline: true,
    valueDomainOverride: useStackedDomain ? undefined : valueDomain,
    tooltipFields: ctx.tooltipFields,
    manualColor: ctx.colorField ? undefined : ctx.manualColor,
    labels: {
      measure: getFieldDisplayName(measure),
      category: categoryDimension ? getFieldDisplayName(categoryDimension) : undefined,
    },
  });
}

// ---------- Chart Type Handlers ---------------------------------------------

function handleScatter(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  const { xCol, yCol } = resolveXYColumns(xf, yf);
  
  // Apply shared domains: measures use numeric domains, discrete dimensions use categorical domains
  const xDomain = xf.type === 'measure' 
    ? ctx.sharedMeasureDomains?.[xCol] 
    : (xf.type === 'dimension' && xf.flavour === 'discrete' 
        ? ctx.sharedCategoricalDomains?.[xCol] 
        : ctx.sharedMeasureDomains?.[xCol]);
  const yDomain = yf.type === 'measure' 
    ? ctx.sharedMeasureDomains?.[yCol] 
    : (yf.type === 'dimension' && yf.flavour === 'discrete' 
        ? ctx.sharedCategoricalDomains?.[yCol] 
        : ctx.sharedMeasureDomains?.[yCol]);
  const domainOptions = {
    x: getFieldDisplayName(xf),
    y: getFieldDisplayName(yf),
    ...(xDomain || yDomain ? { domain: { x: xDomain, y: yDomain } } : {}),
  };
  const hasDiscreteColor = ctx.colorField?.flavour === 'discrete';
  
  // Special-case: measure vs measure should be a single dot (global aggregate)
  if (xf.type === 'measure' && yf.type === 'measure' && !hasDiscreteColor) {
    const single = [{
      [xCol]: aggregateValues(data, xCol, (xf as any).aggregation),
      [yCol]: aggregateValues(data, yCol, (yf as any).aggregation)
    }];
    return scatterChart(
      single, xCol, yCol, domainOptions,
      ctx.colorField, ctx.colorScheme, ctx.colorBias, ctx.manualColor,
      ctx.sizeField, ctx.sizeRange, ctx.manualSize, ctx.sizeScaleData,
      ctx.labelCfg, ctx.tooltipFields, ctx.facetFields, ctx.shapeField, ctx.manualShape
    );
  }
  
  return scatterChart(
    data, xCol, yCol, domainOptions,
    ctx.colorField, ctx.colorScheme, ctx.colorBias, ctx.manualColor,
    ctx.sizeField, ctx.sizeRange, ctx.manualSize, ctx.sizeScaleData,
    ctx.labelCfg, ctx.tooltipFields, ctx.facetFields, ctx.shapeField, ctx.manualShape
  );
}

function handleLine(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  // measure vs continuous dimension – ensure dimension on one axis
  if (xf.type === 'measure' && yf.type === 'dimension') {
    // Prefer vertical line when measure is on X and dimension on Y
    const xCol = getResultColumnName({ ...xf, aggregation: xf.aggregation || 'sum' } as any);
    const yCol = getResultColumnName(yf);
    const xDomain = ctx.sharedMeasureDomains?.[xCol];
    const yDomain = ctx.sharedMeasureDomains?.[yCol];
    return verticalLineChart(
      data, xCol, yCol,
      { x: getFieldDisplayName(xf), y: getFieldDisplayName(yf) },
      { x: xDomain, y: yDomain },
      ctx.colorField, ctx.colorScheme, ctx.colorBias, ctx.manualColor,
      ctx.sizeField, ctx.sizeRange, ctx.manualSize,
      ctx.labelCfg, ctx.tooltipFields, ctx.facetFields,
      xf, yf
    );
  }
  
  if (xf.type === 'dimension' && yf.type === 'measure') {
    const xCol = getResultColumnName(xf);
    const yCol = getResultColumnName({ ...yf, aggregation: yf.aggregation || 'sum' } as any);
    const xDomain = ctx.sharedMeasureDomains?.[xCol];
    const yDomain = ctx.sharedMeasureDomains?.[yCol];
    return lineChart(
      data, xCol, yCol,
      { x: getFieldDisplayName(xf), y: getFieldDisplayName(yf) },
      { x: xDomain, y: yDomain },
      ctx.colorField, ctx.colorScheme, ctx.colorBias, ctx.manualColor,
      ctx.sizeField, ctx.sizeRange, ctx.manualSize,
      ctx.labelCfg, ctx.tooltipFields, ctx.facetFields,
      xf, yf
    );
  }
  
  // Fallback: both measures or both dimensions → scatter
  const { xCol, yCol } = resolveXYColumns(xf, yf);
  return scatterChart(
    data, xCol, yCol, { x: getFieldDisplayName(xf), y: getFieldDisplayName(yf) },
    ctx.colorField, ctx.colorScheme, ctx.colorBias, ctx.manualColor,
    ctx.sizeField, ctx.sizeRange, ctx.manualSize, ctx.sizeScaleData,
    ctx.labelCfg, ctx.tooltipFields, ctx.facetFields, undefined, ctx.manualShape
  );
}

function handleBarX(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  // barX expects a measure on X and optional category on Y
  if (xf.type !== 'measure') {
    // If X is not a measure, try Y
    if (yf.type === 'measure') {
      // Swap: use Y as measure, X as category (render as barY)
      return createBar(data, yf, xf.type === 'dimension' ? xf : null, 'vertical', ctx);
    }
    // Neither is a measure: fallback to scatter
    const { xCol, yCol } = resolveXYColumns(xf, yf);
    return scatterChart(
      data, xCol, yCol, { x: getFieldDisplayName(xf), y: getFieldDisplayName(yf) },
      ctx.colorField, ctx.colorScheme, ctx.colorBias, ctx.manualColor,
      ctx.sizeField, ctx.sizeRange, ctx.manualSize, ctx.sizeScaleData,
      ctx.labelCfg, ctx.tooltipFields, ctx.facetFields, undefined, ctx.manualShape
    );
  }
  
  // X is a measure - check if Y is also a measure (measure vs measure)
  if (yf.type === 'measure') {
    // Aggregate to single bar
    const { xCol } = resolveXYColumns(xf, yf);
    const aggData = [{ [xCol]: aggregateValues(data, xCol, xf.aggregation) }];
    const noColorCtx = { ...ctx, colorField: undefined, sizeField: undefined, sizeRange: undefined };
    return createBar(aggData, xf, null, 'horizontal', noColorCtx);
  }
  
  return createBar(data, xf, yf.type === 'dimension' ? yf : null, 'horizontal', ctx);
}

function handleBarY(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  // barY expects a measure on Y and optional category on X
  if (yf.type !== 'measure') {
    // If Y is not a measure, try X
    if (xf.type === 'measure') {
      // Swap: use X as measure, Y as category (render as barX)
      return createBar(data, xf, yf.type === 'dimension' ? yf : null, 'horizontal', ctx);
    }
    // Neither is a measure: fallback to scatter
    const { xCol, yCol } = resolveXYColumns(xf, yf);
    return scatterChart(
      data, xCol, yCol, { x: getFieldDisplayName(xf), y: getFieldDisplayName(yf) },
      ctx.colorField, ctx.colorScheme, ctx.colorBias, ctx.manualColor,
      ctx.sizeField, ctx.sizeRange, ctx.manualSize, ctx.sizeScaleData,
      ctx.labelCfg, ctx.tooltipFields, ctx.facetFields, undefined, ctx.manualShape
    );
  }
  
  // Y is a measure - check if X is also a measure (measure vs measure)
  if (xf.type === 'measure') {
    // Aggregate to single bar
    const { yCol } = resolveXYColumns(xf, yf);
    const aggData = [{ [yCol]: aggregateValues(data, yCol, yf.aggregation) }];
    const noColorCtx = { ...ctx, colorField: undefined, sizeField: undefined, sizeRange: undefined };
    return createBar(aggData, yf, null, 'vertical', noColorCtx);
  }
  
  return createBar(data, yf, xf.type === 'dimension' ? xf : null, 'vertical', ctx);
}

function handleTickX(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  // Tick strip along X axis - expects continuous data on X
  const xDim = xf.type === 'dimension' && xf.flavour === 'continuous' ? xf : null;
  const xMeasure = xf.type === 'measure' && xf.flavour === 'continuous' ? xf : null;
  const xContinuous = xDim || xMeasure;
  const category = yf.type === 'dimension' && yf.flavour === 'discrete' ? yf : null;
  
  if (xContinuous) {
    const xCol = xDim 
      ? getResultColumnName(xDim) 
      : getResultColumnName({ ...xMeasure!, aggregation: xMeasure!.aggregation || 'sum' } as any);
    return tickStrip(
      { 
        xFields: [], 
        yFields: [], 
        queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
        colorField: ctx.colorField,
        colorScheme: ctx.colorScheme,
        colorBias: ctx.colorBias,
        sizeField: ctx.sizeField,
        sizeRange: ctx.sizeRange,
        manualSize: ctx.manualSize
      },
      'x',
      xCol,
      category ? getResultColumnName(category) : undefined,
      { dimension: getFieldDisplayName(xContinuous), category: category ? getFieldDisplayName(category) : undefined },
      ctx.sharedMeasureDomains
    );
  }
  
  // If X is discrete but Y has continuous data, swap to tickY
  if (yf.flavour === 'continuous') {
    const yCol = yf.type === 'measure' 
      ? getResultColumnName({ ...yf, aggregation: yf.aggregation || 'sum' } as any)
      : getResultColumnName(yf);
    const xCategory = xf.type === 'dimension' && xf.flavour === 'discrete' ? xf : null;
    return tickStrip(
      { 
        xFields: [], 
        yFields: [], 
        queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
        colorField: ctx.colorField,
        colorScheme: ctx.colorScheme,
        colorBias: ctx.colorBias,
        sizeField: ctx.sizeField,
        sizeRange: ctx.sizeRange,
        manualSize: ctx.manualSize
      },
      'y',
      yCol,
      xCategory ? getResultColumnName(xCategory) : undefined,
      { dimension: getFieldDisplayName(yf), category: xCategory ? getFieldDisplayName(xCategory) : undefined },
      ctx.sharedMeasureDomains
    );
  }
  
  // Both discrete - fallback to scatter
  const { xCol, yCol } = resolveXYColumns(xf, yf);
  return scatterChart(
    data, xCol, yCol, { x: getFieldDisplayName(xf), y: getFieldDisplayName(yf) },
    ctx.colorField, ctx.colorScheme, ctx.colorBias, ctx.manualColor,
    ctx.sizeField, ctx.sizeRange, ctx.manualSize, ctx.sizeScaleData,
    ctx.labelCfg, ctx.tooltipFields, ctx.facetFields, undefined, ctx.manualShape
  );
}

function handleTickY(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  // Tick strip along Y axis - expects continuous data on Y
  const yDim = yf.type === 'dimension' && yf.flavour === 'continuous' ? yf : null;
  const yMeasure = yf.type === 'measure' && yf.flavour === 'continuous' ? yf : null;
  const yContinuous = yDim || yMeasure;
  const category = xf.type === 'dimension' && xf.flavour === 'discrete' ? xf : null;
  
  if (yContinuous) {
    const yCol = yDim 
      ? getResultColumnName(yDim) 
      : getResultColumnName({ ...yMeasure!, aggregation: yMeasure!.aggregation || 'sum' } as any);
    return tickStrip(
      {
        xFields: [], 
        yFields: [], 
        queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
        colorField: ctx.colorField,
        colorScheme: ctx.colorScheme,
        colorBias: ctx.colorBias,
        sizeField: ctx.sizeField,
        sizeRange: ctx.sizeRange,
        manualSize: ctx.manualSize,
        xTickFormat: ctx.xTickFormat,
        yTickFormat: ctx.yTickFormat,
      },
      'y',
      yCol,
      category ? getResultColumnName(category) : undefined,
      { dimension: getFieldDisplayName(yContinuous), category: category ? getFieldDisplayName(category) : undefined },
      ctx.sharedMeasureDomains
    );
  }
  
  // If Y is discrete but X has continuous data, swap to tickX
  if (xf.flavour === 'continuous') {
    const xCol = xf.type === 'measure' 
      ? getResultColumnName({ ...xf, aggregation: xf.aggregation || 'sum' } as any)
      : getResultColumnName(xf);
    const yCategory = yf.type === 'dimension' && yf.flavour === 'discrete' ? yf : null;
    return tickStrip(
      { 
        xFields: [], 
        yFields: [], 
        queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
        colorField: ctx.colorField,
        colorScheme: ctx.colorScheme,
        colorBias: ctx.colorBias,
        sizeField: ctx.sizeField,
        sizeRange: ctx.sizeRange,
        manualSize: ctx.manualSize,
        xTickFormat: ctx.xTickFormat,
        yTickFormat: ctx.yTickFormat,
      },
      'x',
      xCol,
      yCategory ? getResultColumnName(yCategory) : undefined,
      { dimension: getFieldDisplayName(xf), category: yCategory ? getFieldDisplayName(yCategory) : undefined },
      ctx.sharedMeasureDomains
    );
  }
  
  // Both discrete - fallback to scatter
  const { xCol, yCol } = resolveXYColumns(xf, yf);
  return scatterChart(
    data, xCol, yCol, { x: getFieldDisplayName(xf), y: getFieldDisplayName(yf) },
    ctx.colorField, ctx.colorScheme, ctx.colorBias, ctx.manualColor,
    ctx.sizeField, ctx.sizeRange, ctx.manualSize, ctx.sizeScaleData,
    ctx.labelCfg, ctx.tooltipFields, ctx.facetFields, undefined, ctx.manualShape
  );
}

function handleBoxX(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  const xContinuous = xf.flavour === 'continuous' ? xf : (yf.flavour === 'continuous' ? yf : null);
  const category = yf.type === 'dimension' && yf.flavour === 'discrete' ? yf : null;

  if (!xContinuous) {
    return handleTickX(data, xf, yf, ctx);
  }

  const xCol = xContinuous.type === 'measure'
    ? getResultColumnName({ ...xContinuous, aggregation: xContinuous.aggregation || 'sum' } as any)
    : getResultColumnName(xContinuous);

  return boxPlot(
    {
      xFields: [],
      yFields: [],
      queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
      manualColor: ctx.manualColor,
      categoryAxisDescriptor: category
        ? { axis: 'y', columnName: getResultColumnName(category), domain: ctx.sharedCategoricalDomains?.[getResultColumnName(category)] }
        : undefined,
    },
    'x',
    xCol,
    category ? getResultColumnName(category) : undefined,
    {
      dimension: getFieldDisplayName(xContinuous),
      category: category ? getFieldDisplayName(category) : undefined,
    },
    ctx.sharedMeasureDomains?.[xCol] as [number, number] | [Date, Date] | undefined,
  );
}

function handleBoxY(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  const yContinuous = yf.flavour === 'continuous' ? yf : (xf.flavour === 'continuous' ? xf : null);
  const category = xf.type === 'dimension' && xf.flavour === 'discrete' ? xf : null;

  if (!yContinuous) {
    return handleTickY(data, xf, yf, ctx);
  }

  const yCol = yContinuous.type === 'measure'
    ? getResultColumnName({ ...yContinuous, aggregation: yContinuous.aggregation || 'sum' } as any)
    : getResultColumnName(yContinuous);

  return boxPlot(
    {
      xFields: [],
      yFields: [],
      queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
      manualColor: ctx.manualColor,
      categoryAxisDescriptor: category
        ? { axis: 'x', columnName: getResultColumnName(category), domain: ctx.sharedCategoricalDomains?.[getResultColumnName(category)] }
        : undefined,
    },
    'y',
    yCol,
    category ? getResultColumnName(category) : undefined,
    {
      dimension: getFieldDisplayName(yContinuous),
      category: category ? getFieldDisplayName(category) : undefined,
    },
    ctx.sharedMeasureDomains?.[yCol] as [number, number] | [Date, Date] | undefined,
  );
}

function handleDot(data: any[], xf: Field, yf: Field, _ctx: ChartContext): Plot.PlotOptions {
  const xCol = xf.columnName;
  const yCol = yf.columnName;
  return {
    x: { label: getFieldDisplayName(xf) },
    y: { label: getFieldDisplayName(yf) },
    marks: [Plot.dot(data, { x: xCol, y: yCol, fill: DEFAULT_CHART_COLOR, r: 2 })],
  };
}

function handleGanttX(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  // Horizontal Gantt: continuous dimension on X (start), discrete dimension on Y (categories)
  // Size field is used for duration, not thickness
  const startField = xf.flavour === 'continuous' ? xf : (yf.flavour === 'continuous' ? yf : xf);
  const categoryField = yf.type === 'dimension' && yf.flavour === 'discrete' ? yf : 
                        (xf.type === 'dimension' && xf.flavour === 'discrete' ? xf : null);
  
  const startColumn = resolveColumnInData(data, startField);
  const durationColumn = ctx.sizeField ? resolveColumnInData(data, ctx.sizeField) : undefined;
  const categoryColumn = categoryField ? resolveColumnInData(data, categoryField) : undefined;
  
  // Merge measure and categorical domains for ganttChart
  // The category domain ensures all categories appear even when facet has no data in zoom range
  const mergedDomains = {
    ...ctx.sharedMeasureDomains,
    ...(categoryColumn && ctx.sharedCategoricalDomains?.[categoryColumn] 
      ? { [categoryColumn]: ctx.sharedCategoricalDomains[categoryColumn] } 
      : {}),
  };
  
  const result = ganttChart(
    {
      xFields: [],
      yFields: [],
      queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
      colorField: ctx.colorField,
      colorScheme: ctx.colorScheme,
      colorBias: ctx.colorBias,
      manualSize: ctx.manualSize,
      bandThicknessScale: ctx.bandThicknessScale,
      manualColor: ctx.manualColor,
      tooltipFields: ctx.tooltipFields,
      ganttZoomRange: ctx.ganttZoomRange,
    },
    'x',
    startColumn,
    durationColumn,
    categoryColumn,
    {
      start: getFieldDisplayName(startField),
      duration: ctx.sizeField ? getFieldDisplayName(ctx.sizeField) : undefined,
      category: categoryField ? getFieldDisplayName(categoryField) : undefined,
    },
    mergedDomains,
    1.0, // zoomLevel
    ctx.labelCfg // label configuration
  );
  
  return result.options;
}

function handleGanttY(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  // Vertical Gantt: continuous dimension on Y (start), discrete dimension on X (categories)
  // Size field is used for duration, not thickness
  const startField = yf.flavour === 'continuous' ? yf : (xf.flavour === 'continuous' ? xf : yf);
  const categoryField = xf.type === 'dimension' && xf.flavour === 'discrete' ? xf :
                        (yf.type === 'dimension' && yf.flavour === 'discrete' ? yf : null);
  
  const startColumn = resolveColumnInData(data, startField);
  const durationColumn = ctx.sizeField ? resolveColumnInData(data, ctx.sizeField) : undefined;
  const categoryColumn = categoryField ? resolveColumnInData(data, categoryField) : undefined;
  
  // Merge measure and categorical domains for ganttChart
  // The category domain ensures all categories appear even when facet has no data in zoom range
  const mergedDomains = {
    ...ctx.sharedMeasureDomains,
    ...(categoryColumn && ctx.sharedCategoricalDomains?.[categoryColumn] 
      ? { [categoryColumn]: ctx.sharedCategoricalDomains[categoryColumn] } 
      : {}),
  };
  
  const result = ganttChart(
    {
      xFields: [],
      yFields: [],
      queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
      colorField: ctx.colorField,
      colorScheme: ctx.colorScheme,
      colorBias: ctx.colorBias,
      manualSize: ctx.manualSize,
      bandThicknessScale: ctx.bandThicknessScale,
      manualColor: ctx.manualColor,
      tooltipFields: ctx.tooltipFields,
      ganttZoomRange: ctx.ganttZoomRange,
    },
    'y',
    startColumn,
    durationColumn,
    categoryColumn,
    {
      start: getFieldDisplayName(startField),
      duration: ctx.sizeField ? getFieldDisplayName(ctx.sizeField) : undefined,
      category: categoryField ? getFieldDisplayName(categoryField) : undefined,
    },
    mergedDomains,
    1.0, // zoomLevel
    ctx.labelCfg // label configuration
  );
  
  return result.options;
}

function handleCdf(data: any[], _xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  const valueColumn = yf.columnName;
  return buildCdfOptions({
    data,
    valueColumn,
    valueLabel: getFieldDisplayName(yf),
    colorField: ctx.colorField,
    colorScheme: ctx.colorScheme,
    colorBias: ctx.colorBias,
    manualColor: ctx.manualColor,
    manualSize: ctx.manualSize,
    tooltipFields: ctx.tooltipFields,
    facetFields: ctx.facetFields,
  });
}

function handlePieMessage(): Plot.PlotOptions {
  return messageOptions('Pie charts are available as a global chart type.');
}

function handleHeatmap(data: any[], xf: Field, yf: Field, ctx: ChartContext): Plot.PlotOptions {
  return buildHeatmapOptions({
  data,
    xField: xf,
    yField: yf,
    colorField: ctx.colorField,
    colorScheme: ctx.colorScheme,
    colorBias: ctx.colorBias,
    manualColor: ctx.manualColor,
    manualSize: ctx.manualSize,
    labelFields: ctx.labelCfg?.labelFields,
    labelFontSize: ctx.labelCfg?.fontSize,
    tooltipFields: ctx.tooltipFields,
    facetFields: ctx.facetFields,
    xTickFormat: ctx.xTickFormat,
    yTickFormat: ctx.yTickFormat,
  });
}

// ---------- Chart Type Registry ---------------------------------------------

/**
 * Registry mapping chart types to their handler functions.
 * Enables clean dispatch without giant switch statements.
 */
const CHART_HANDLERS: Record<CellChartType, ChartHandler> = {
  scatter: handleScatter,
  line: handleLine,
  barX: handleBarX,
  barY: handleBarY,
  tickX: handleTickX,
  tickY: handleTickY,
  boxX: handleBoxX,
  boxY: handleBoxY,
  dot: handleDot,
  ganttX: handleGanttX,
  ganttY: handleGanttY,
  cdf: handleCdf,
  pie: handlePieMessage,
  heatmap: handleHeatmap,
};

// ---------- Public API ------------------------------------------------------

/**
 * Generate PlotOptions for a single cell given X/Y fields and optional shared measure domains.
 * Supports overrides for chart type selection.
 */
export function generatePairChartOptions(
  data: any[],
  xField: Field | null,
  yField: Field | null,
  sharedMeasureDomains?: Domains,
  overrides?: ChartTypeOverrides,
  colorField?: Field,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  sizeScaleData?: any[],
  bandThicknessScale?: number,
  colorScheme?: string,
  colorBias?: number,
  manualColor?: string,
  labelCfg?: LabelConfig,
  tooltipFields?: Field[],
  facetFields?: Field[],
  sharedCategoricalDomains?: Record<string, any[]>,
  ganttZoomRange?: GanttZoomRange | null,
  shapeField?: Field,
  manualShape?: string,
  distributionVariant?: import('../../types').DistributionVariant,
  xTickFormat?: (d: any) => string,
  yTickFormat?: (d: any) => string,
): Plot.PlotOptions {
  // Bundle context for cleaner parameter passing
  const ctx: ChartContext = {
    sharedMeasureDomains,
    sharedCategoricalDomains,
    colorField,
    sizeField,
    sizeRange,
    manualSize,
    sizeScaleData,
    bandThicknessScale,
    colorScheme,
    colorBias,
    manualColor,
    labelCfg,
    tooltipFields,
    facetFields,
    ganttZoomRange,
    shapeField,
    manualShape,
    distributionVariant,
    xTickFormat,
    yTickFormat,
  };

  if (!xField && !yField) {
    return messageOptions('No fields');
  }

  // Handle single-field cases
  if (xField && !yField) {
    if (xField.type === 'measure') {
      return createBar(data, xField, null, 'horizontal', ctx);
    }
    return scatterForDimOnly(data, xField, ctx);
  }
  
  if (!xField && yField) {
    if (yField.type === 'measure') {
      return createBar(data, yField, null, 'vertical', ctx);
    }
    return scatterForDimOnly(data, yField, ctx);
  }

  // Both fields present - use registry dispatch
  const xf = xField!;
  const yf = yField!;
  const resolved: CellChartType = resolveChartTypeForPair(xf, yf, overrides);
  const selected: CellChartType = distributionVariant === 'box-plot'
    ? (resolved === 'tickX' ? 'boxX' : resolved === 'tickY' ? 'boxY' : resolved)
    : resolved;
  const handler = CHART_HANDLERS[selected];
  if (!handler) {
    return messageOptions('Unsupported combination');
  }
  
  return handler(data, xf, yf, ctx);
}
