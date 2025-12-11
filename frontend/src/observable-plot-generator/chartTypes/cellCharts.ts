import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { getFieldColumnName } from '../helpers/fields';
import { lineChart, verticalLineChart } from './lineChart';
import { scatterChart } from './scatterChart';
import { tickStrip } from './tickStrip';
import { CellChartType, ChartTypeOverrides, resolveChartTypeForPair } from '../helpers/chartTypeResolver';
import { buildBarOptions, resolveMeasureAlias, computeBandPaddingFromSizeField, sortCategoriesByValue } from './barCore';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';

type Domains = Record<string, [number, number] | [Date, Date]> | undefined;

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
  colorScheme?: string,
  colorBias?: number,
  manualColor?: string,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number },
  tooltipFields?: Field[]
): Plot.PlotOptions {
  if (!xField && !yField) {
    return messageOptions('No fields');
  }

  // If one side is missing, choose orientation by the present measure
  if (xField && !yField) {
    if (xField.type === 'measure') return createBarX(
      data,
      xField,
      null,
      sharedMeasureDomains,
      colorField,
      sizeField,
      sizeRange,
      manualSize,
      colorScheme,
      colorBias,
      manualColor,
      tooltipFields
    );
    // Single dimension alone → show tick strip would be an alternative, but inside cartesian grid we stick to scatter
    return scatterForDimOnly(data, xField, colorField, sizeField, sizeRange, manualSize, colorBias, manualColor, tooltipFields);
  }
  if (!xField && yField) {
    if (yField.type === 'measure') return createBarY(
      data,
      yField,
      null,
      sharedMeasureDomains,
      colorField,
      sizeField,
      sizeRange,
      manualSize,
      colorScheme,
      colorBias,
      manualColor,
      tooltipFields
    );
    return scatterForDimOnly(data, yField, colorField, sizeField, sizeRange, manualSize, colorBias, manualColor, tooltipFields);
  }

  const xf = xField!;
  const yf = yField!;
  const selected: CellChartType = resolveChartTypeForPair(xf, yf, overrides);

  switch (selected) {
    case 'scatter': {
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      // Apply shared domains only for measures; dimensions should use local (filtered) domains
      const xDomain = xf.type === 'measure' ? sharedMeasureDomains?.[xCol] : undefined;
      const yDomain = yf.type === 'measure' ? sharedMeasureDomains?.[yCol] : undefined;
      const domainOptions = {
        x: xCol, 
        y: yCol,
        ...(xDomain || yDomain ? { domain: { x: xDomain, y: yDomain } } : {})
      };
      // Special-case: measure vs measure should be a single dot (global aggregate),
      // not one dot per record (which may be grouped by unrelated dimensions).
      if (xf.type === 'measure' && yf.type === 'measure') {
        const aggregate = (col: string, agg?: string) => {
          const values = (Array.isArray(data) ? data : []).map((d) => d?.[col]).filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
          if (values.length === 0) return undefined as unknown as number;
          const a = (agg || 'sum').toLowerCase();
          switch (a) {
            case 'sum':
            case undefined as any:
              return values.reduce((s, v) => s + v, 0);
            case 'count':
            case 'count_distinct':
              // COUNT aliases are already counts per group; sum them
              return values.reduce((s, v) => s + v, 0);
            case 'min':
              return Math.min(...values);
            case 'max':
              return Math.max(...values);
            case 'avg':
              // Fallback to simple mean across groups (not weighted); acceptable for now
              return values.reduce((s, v) => s + v, 0) / values.length;
            default:
              return values.reduce((s, v) => s + v, 0);
          }
        };
        const single = [{ [xCol]: aggregate(xCol, (xf as any).aggregation), [yCol]: aggregate(yCol, (yf as any).aggregation) } as any];
        return scatterChart(single, xCol, yCol, domainOptions, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, labelCfg, tooltipFields);
      }
      // Otherwise render scatter with full data
	  return scatterChart(data, xCol, yCol, domainOptions, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, labelCfg, tooltipFields);
    }
    case 'line': {
      // measure vs continuous dimension – ensure dimension on one axis
      if (xf.type === 'measure' && yf.type === 'dimension') {
        // Prefer vertical line when measure is on X and dimension on Y
        const xCol = getResultColumnName({ ...xf, aggregation: xf.aggregation || 'sum' } as any);
        const yCol = getResultColumnName(yf);
        const xDomain = sharedMeasureDomains?.[xCol];
        const yDomain = sharedMeasureDomains?.[yCol];
  return verticalLineChart(data, xCol, yCol, { x: xCol, y: getFieldDisplayName(yf) }, { x: xDomain, y: yDomain }, colorField, colorScheme, colorBias, sizeField, sizeRange, manualSize, labelCfg);
      }
      if (xf.type === 'dimension' && yf.type === 'measure') {
        const xCol = getResultColumnName(xf);
        const yCol = getResultColumnName({ ...yf, aggregation: yf.aggregation || 'sum' } as any);
        const xDomain = sharedMeasureDomains?.[xCol];
        const yDomain = sharedMeasureDomains?.[yCol];
  return lineChart(data, xCol, yCol, { x: getFieldDisplayName(xf), y: yCol }, { x: xDomain, y: yDomain }, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, labelCfg, tooltipFields);
      }
      // If both are measures or both are dimensions, fallback to scatter (empty if no data)
      const { xCol, yCol } = resolveXYColumns(xf, yf);
          return scatterChart(data, xCol, yCol, { x: xCol, y: yCol }, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, labelCfg, tooltipFields);
    }
    case 'barX': {
      // barX expects a measure on X and optional category on Y
      // Fallback handling for mismatched field types:
      if (xf.type !== 'measure') {
        // If X is not a measure, try to find the measure on Y
        if (yf.type === 'measure') {
          // Swap: use Y as measure, X as category (render as barY)
          return createBarY(
            data,
            yf,
            xf.type === 'dimension' ? xf : null,
            sharedMeasureDomains,
            colorField,
            sizeField,
            sizeRange,
            manualSize,
            colorScheme,
            colorBias,
            manualColor,
            tooltipFields
          );
        }
        // Neither is a measure: fallback to scatter
        const { xCol, yCol } = resolveXYColumns(xf, yf);
        return scatterChart(data, xCol, yCol, { x: xCol, y: yCol }, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, labelCfg, tooltipFields);
      }
      // X is a measure - check if Y is also a measure (measure vs measure)
      if (yf.type === 'measure') {
        // Aggregate to single point and render as single bar (no category)
        const { xCol, yCol } = resolveXYColumns(xf, yf);
        const aggregate = (col: string, agg?: string) => {
          const values = (Array.isArray(data) ? data : []).map((d) => d?.[col]).filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
          if (values.length === 0) return 0;
          const a = (agg || 'sum').toLowerCase();
          switch (a) {
            case 'sum': return values.reduce((s, v) => s + v, 0);
            case 'count':
            case 'count_distinct': return values.reduce((s, v) => s + v, 0);
            case 'min': return Math.min(...values);
            case 'max': return Math.max(...values);
            case 'avg': return values.reduce((s, v) => s + v, 0) / values.length;
            default: return values.reduce((s, v) => s + v, 0);
          }
        };
        const aggData = [{ [xCol]: aggregate(xCol, xf.aggregation) }];
        return createBarX(
          aggData,
          xf,
          null,  // No category dimension
          sharedMeasureDomains,
          undefined,  // No color for single bar
          undefined,
          undefined,
          manualSize,
          colorScheme,
          colorBias,
          manualColor,
          tooltipFields
        );
      }
      return createBarX(
        data,
        xf,
        yf.type === 'dimension' ? yf : null,
        sharedMeasureDomains,
        colorField,
        sizeField,
        sizeRange,
        manualSize,
        colorScheme,
        colorBias,
        manualColor,
        tooltipFields
      );
    }
    case 'barY': {
      // barY expects a measure on Y and optional category on X
      // Fallback handling for mismatched field types:
      if (yf.type !== 'measure') {
        // If Y is not a measure, try to find the measure on X
        if (xf.type === 'measure') {
          // Swap: use X as measure, Y as category (render as barX)
          return createBarX(
            data,
            xf,
            yf.type === 'dimension' ? yf : null,
            sharedMeasureDomains,
            colorField,
            sizeField,
            sizeRange,
            manualSize,
            colorScheme,
            colorBias,
            manualColor,
            tooltipFields
          );
        }
        // Neither is a measure: fallback to scatter
        const { xCol, yCol } = resolveXYColumns(xf, yf);
        return scatterChart(data, xCol, yCol, { x: xCol, y: yCol }, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, labelCfg, tooltipFields);
      }
      // Y is a measure - check if X is also a measure (measure vs measure)
      if (xf.type === 'measure') {
        // Aggregate to single point and render as single bar (no category)
        const { xCol, yCol } = resolveXYColumns(xf, yf);
        const aggregate = (col: string, agg?: string) => {
          const values = (Array.isArray(data) ? data : []).map((d) => d?.[col]).filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
          if (values.length === 0) return 0;
          const a = (agg || 'sum').toLowerCase();
          switch (a) {
            case 'sum': return values.reduce((s, v) => s + v, 0);
            case 'count':
            case 'count_distinct': return values.reduce((s, v) => s + v, 0);
            case 'min': return Math.min(...values);
            case 'max': return Math.max(...values);
            case 'avg': return values.reduce((s, v) => s + v, 0) / values.length;
            default: return values.reduce((s, v) => s + v, 0);
          }
        };
        const aggData = [{ [yCol]: aggregate(yCol, yf.aggregation) }];
        return createBarY(
          aggData,
          yf,
          null,  // No category dimension
          sharedMeasureDomains,
          undefined,  // No color for single bar
          undefined,
          undefined,
          manualSize,
          colorScheme,
          colorBias,
          manualColor,
          tooltipFields
        );
      }
      return createBarY(
        data,
        yf,
        xf.type === 'dimension' ? xf : null,
        sharedMeasureDomains,
        colorField,
        sizeField,
        sizeRange,
        manualSize,
        colorScheme,
        colorBias,
        manualColor,
        tooltipFields
      );
    }
    case 'tickX': {
      // Tick strip along X axis - expects continuous data on X
      // First, try continuous dimension on X
      const xDim = xf.type === 'dimension' && xf.flavour === 'continuous' ? xf : null;
      // If X is a measure (continuous), we can also render as tick strip
      const xMeasure = xf.type === 'measure' && xf.flavour === 'continuous' ? xf : null;
      const xContinuous = xDim || xMeasure;
      const category = yf.type === 'dimension' && yf.flavour === 'discrete' ? yf : null;
      
      if (xContinuous) {
        const xCol = xDim ? getResultColumnName(xDim) : getResultColumnName({ ...xMeasure!, aggregation: xMeasure!.aggregation || 'sum' } as any);
        return tickStrip(
          // Build minimal context for tickStrip API, including size parameters
          { 
            xFields: [], 
            yFields: [], 
            queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
            colorField,
            colorScheme,
            colorBias,
            sizeField,
            sizeRange,
            manualSize
          },
          'x',
          xCol,
          category ? getResultColumnName(category) : undefined
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
            colorField,
            colorScheme,
            colorBias,
            sizeField,
            sizeRange,
            manualSize
          },
          'y',
          yCol,
          xCategory ? getResultColumnName(xCategory) : undefined
        );
      }
      // Both discrete - fallback to scatter/dot
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      return scatterChart(data, xCol, yCol, { x: xCol, y: yCol }, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, labelCfg, tooltipFields);
    }
    case 'tickY': {
      // Tick strip along Y axis - expects continuous data on Y
      // First, try continuous dimension on Y
      const yDim = yf.type === 'dimension' && yf.flavour === 'continuous' ? yf : null;
      // If Y is a measure (continuous), we can also render as tick strip
      const yMeasure = yf.type === 'measure' && yf.flavour === 'continuous' ? yf : null;
      const yContinuous = yDim || yMeasure;
      const category = xf.type === 'dimension' && xf.flavour === 'discrete' ? xf : null;
      
      if (yContinuous) {
        const yCol = yDim ? getResultColumnName(yDim) : getResultColumnName({ ...yMeasure!, aggregation: yMeasure!.aggregation || 'sum' } as any);
        return tickStrip(
          {
            xFields: [], 
            yFields: [], 
            queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any,
            colorField,
            colorScheme,
            colorBias,
            sizeField,
            sizeRange,
            manualSize
          },
          'y',
          yCol,
          category ? getResultColumnName(category) : undefined
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
            colorField,
            colorScheme,
            colorBias,
            sizeField,
            sizeRange,
            manualSize
          },
          'x',
          xCol,
          yCategory ? getResultColumnName(yCategory) : undefined
        );
      }
      // Both discrete - fallback to scatter/dot
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      return scatterChart(data, xCol, yCol, { x: xCol, y: yCol }, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, labelCfg, tooltipFields);
    }
    case 'dot': {
      const xCol = xf.columnName;
      const yCol = yf.columnName;
      return {
        x: { label: xCol },
        y: { label: yCol },
        marks: [Plot.dot(data, { x: xCol, y: yCol, fill: DEFAULT_CHART_COLOR, r: 2 })],
      };
    }
    default:
      return messageOptions('Unsupported combination');
  }
}

function resolveXYColumns(xf: Field, yf: Field): { xCol: string; yCol: string } {
  const xCol = xf.type === 'measure'
    ? getResultColumnName({ ...xf, aggregation: xf.aggregation || 'sum' } as any)
    : getResultColumnName(xf);
  const yCol = yf.type === 'measure'
    ? getResultColumnName({ ...yf, aggregation: yf.aggregation || 'sum' } as any)
    : getResultColumnName(yf);
  return { xCol, yCol };
}

// function isNumericColumn(data: any[], col: string): boolean {
//   if (!Array.isArray(data) || data.length === 0) return false;
//   return data.some((d) => Number.isFinite(d?.[col]));
// }

function createBarX(
  data: any[],
  measure: Field,
  yDimension: Field | null,
  sharedDomains?: Domains,
  colorField?: Field,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  colorScheme?: string,
  colorBias?: number,
  manualColor?: string,
  tooltipFields?: Field[]
): Plot.PlotOptions {
  const measureName = resolveMeasureAlias(measure);
  
  // Extract value domain from shared domains if available
  let valueDomain: [number, number] | undefined = (sharedDomains && sharedDomains[measureName]) as [number, number] | undefined;
  
  // Get category column and domain
  const categoryColumn = yDimension ? getFieldColumnName(yDimension) : undefined;
  let categoriesDomain: string[] | undefined;
  
  if (categoryColumn) {
    const domainKey = categoryColumn;
    const sharedCatDomain = (sharedDomains && (sharedDomains as any)[domainKey]) as any[] | undefined;
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
  
  // Use barCore.buildBarOptions() instead of inline Plot.barX
  const dynamicPadding = computeBandPaddingFromSizeField(data, sizeField, {
    manualSize,
  }) ?? 0.1;
  const colorColumn = colorField ? getResultColumnName(colorField) : undefined;
  const colorScale = colorField ? deriveColorScaleInfo(data, colorField, colorScheme, colorBias) : null;
  
  // Don't use valueDomainOverride for stacked bars (no category but has color)
  // Let buildBarOptions calculate the correct stacked domain
  const useStackedDomain = !categoryColumn && colorColumn;
  
  return buildBarOptions({
    data,
    measureName,
    orientation: 'horizontal',
    categoryColumn,
    categoriesDomain,
    colorColumn,
    colorScale,
    bandPadding: dynamicPadding,
    zeroBaseline: true,
    valueDomainOverride: useStackedDomain ? undefined : valueDomain,
    tooltipFields: tooltipFields,
    // When there's no color field, use the global/manual bar color for fill
    manualColor: colorField ? undefined : manualColor,
  });
}

function createBarY(
  data: any[],
  measure: Field,
  xDimension: Field | null,
  sharedDomains?: Domains,
  colorField?: Field,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  colorScheme?: string,
  colorBias?: number,
  manualColor?: string,
  tooltipFields?: Field[]
): Plot.PlotOptions {
  const measureName = resolveMeasureAlias(measure);
  
  // Extract value domain from shared domains if available
  let valueDomain: [number, number] | undefined = (sharedDomains && sharedDomains[measureName]) as [number, number] | undefined;
  
  // Get category column and domain
  const categoryColumn = xDimension ? getFieldColumnName(xDimension) : undefined;
  let categoriesDomain: string[] | undefined;
  
  if (categoryColumn) {
    const domainKey = categoryColumn;
    const sharedCatDomain = (sharedDomains && (sharedDomains as any)[domainKey]) as any[] | undefined;
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
  
  // Use barCore.buildBarOptions() instead of inline Plot.barY
  const dynamicPadding = computeBandPaddingFromSizeField(data, sizeField, {
    manualSize,
  }) ?? 0.1;
  const colorColumn = colorField ? getResultColumnName(colorField) : undefined;
  const colorScale = colorField ? deriveColorScaleInfo(data, colorField, colorScheme, colorBias) : null;
  
  // Don't use valueDomainOverride for stacked bars (no category but has color)
  // Let buildBarOptions calculate the correct stacked domain
  const useStackedDomain = !categoryColumn && colorColumn;
  
  return buildBarOptions({
    data,
    measureName,
    orientation: 'vertical',
    categoryColumn,
    categoriesDomain,
    colorColumn,
    colorScale,
    bandPadding: dynamicPadding,
    zeroBaseline: true,
    valueDomainOverride: useStackedDomain ? undefined : valueDomain,
    tooltipFields: tooltipFields,
    // When there's no color field, use the global/manual bar color for fill
    manualColor: colorField ? undefined : manualColor,
  });
}

function scatterForDimOnly(
  data: any[],
  dim: Field,
  colorField?: Field,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  colorBias?: number,
  manualColor?: string,
  tooltipFields?: Field[]
): Plot.PlotOptions {
  const col = dim.columnName;
  return scatterChart(data, col, col, { x: col, y: col }, colorField, undefined, colorBias, manualColor, sizeField, sizeRange, manualSize, undefined, tooltipFields);
}

function messageOptions(text: string): Plot.PlotOptions {
  return {
    marks: [Plot.text([text], { frameAnchor: 'middle', fontSize: 12, fill: 'gray' })],
  };
}

