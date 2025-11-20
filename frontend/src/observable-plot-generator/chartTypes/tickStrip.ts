import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING } from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { computeBandPaddingFromSizeField } from './barCore';
import { Field } from '../../types';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';

// ---------- Helper Functions ---------------------------------------------------------

/**
 * Format a value for display in tooltips
 */
function formatValue(val: any): string {
  if (typeof val === 'number' && !Number.isInteger(val)) {
    return val.toFixed(2);
  }
  return String(val);
}

/**
 * Add color, size, and tooltip fields to tickConfig channels
 * Note: We don't add channels anymore since we're using custom tooltips
 */
function addChannelsToConfig(
  tickConfig: any,
  colorField: Field | undefined,
  colorColumnName: string | undefined,
  sizeField: Field | undefined,
  tooltipFields: Field[] | undefined
): void {
  // Channels removed - not needed for custom tooltips
  // Observable Plot auto-generates tooltips from channels, which we don't want
}

/**
 * Create a custom title function for tooltips (consistent styling across all chart types)
 */
function createTitleFunction(
  dimensionColumn: string,
  dimensionLabel: string,
  categoryDimensionColumn: string | undefined,
  categoryLabel: string | undefined,
  colorField: Field | undefined,
  colorColumnName: string | undefined,
  sizeField: Field | undefined,
  tooltipFields: Field[] | undefined
): (d: any) => string {
  return (d: any) => {
    const parts: string[] = [];
    
    // Always add dimension
    parts.push(`${dimensionLabel}: ${formatValue(d[dimensionColumn])}`);
    
    // Add category if present
    if (categoryDimensionColumn) {
      parts.push(`${categoryLabel}: ${formatValue(d[categoryDimensionColumn])}`);
    }
    
    // Add color field
    if (colorField && colorColumnName) {
      parts.push(`${colorField.columnName}: ${formatValue(d[colorColumnName])}`);
    }
    
    // Add size field
    if (sizeField) {
      const sizeColumnName = getResultColumnName(sizeField);
      parts.push(`${sizeField.columnName}: ${formatValue(d[sizeColumnName])}`);
    }
    
    // Add additional tooltip fields (avoid duplicates)
    if (tooltipFields) {
      tooltipFields.forEach(tf => {
        const colName = getResultColumnName(tf);
        if (colName && colName !== dimensionColumn && colName !== categoryDimensionColumn) {
          const colorColName = colorField ? getResultColumnName(colorField) : null;
          const sizeColName = sizeField ? getResultColumnName(sizeField) : null;
          if (colName !== colorColName && colName !== sizeColName) {
            parts.push(`${tf.columnName}: ${formatValue(d[colName])}`);
          }
        }
      });
    }
    
    return parts.join('\n');
  };
}

/**
 * Build tip format object for tooltips
 */
function buildTipFormat(
  colorField: Field | undefined,
  sizeField: Field | undefined,
  tooltipFields: Field[] | undefined
): any {
  const tipFormat: any = { stroke: false };
  
  if (colorField) {
    tipFormat[colorField.columnName] = true;
  }
  if (sizeField) {
    tipFormat[sizeField.columnName] = true;
  }
  if (tooltipFields) {
    tooltipFields.forEach(tf => {
      tipFormat[tf.columnName] = true;
    });
  }
  
  return tipFormat;
}

/**
 * Apply color scale to plot options if color field is present
 */
function applyColorScale(opts: Plot.PlotOptions, colorScale: any): void {
  if (colorScale) {
    opts.color = {
      ...(opts as any).color,
      ...colorScale,
    } as any;
  }
}

/**
 * Add custom tooltip configuration to plot options
 */
function addCustomTooltip(
  opts: Plot.PlotOptions,
  data: any[],
  dimensionColumn: string,
  dimensionLabel: string,
  categoryDimensionColumn: string | undefined,
  categoryLabel: string | undefined,
  colorField: Field | undefined,
  sizeField: Field | undefined,
  tooltipFields: Field[] | undefined
): void {
  const mainFields: { label: string; column: string }[] = [
    { label: dimensionLabel, column: dimensionColumn }
  ];
  
  if (categoryDimensionColumn && categoryLabel) {
    mainFields.push({ label: categoryLabel, column: categoryDimensionColumn });
  }
  
  (opts as any).__customTooltip = {
    enabled: true,
    data: data, // Pass the data array for tooltip access
    getFields: createTooltipFieldsGetter(
      mainFields,
      colorField,
      sizeField,
      tooltipFields
    )
  };
}

/**
 * Build complete tick configuration with channels, title, and tip
 */
function buildTickConfig(
  baseConfig: any,
  dimensionColumn: string,
  dimensionLabel: string,
  categoryDimensionColumn: string | undefined,
  categoryLabel: string | undefined,
  strokeValue: any,
  colorField: Field | undefined,
  colorColumnName: string | undefined,
  sizeField: Field | undefined,
  tooltipFields: Field[] | undefined
): any {
  const tickConfig: any = {
    ...baseConfig,
    stroke: strokeValue,
    strokeWidth: 1.5
  };
  
  // Don't add channels or tip - we'll use custom tooltips instead
  // Observable Plot auto-generates tooltips from channels, which conflicts with custom tooltips
  
  return tickConfig;
}

// ---------- Main Function ---------------------------------------------------------

/**
 * Tick-strip chart for a single continuous dimension.
 * Orientation rules:
 * - 'x': continuous dimension on X-axis → Plot.tickX
 * - 'y': continuous dimension on Y-axis → Plot.tickY
 */
export function tickStrip(
  context: ChartGenerationContext,
  orientation: 'x' | 'y',
  dimensionColumn: string,
  categoryDimensionColumn?: string,
  labels?: { dimension?: string; category?: string }
): Plot.PlotOptions {
  const { queryResult, colorField, colorScheme, colorBias, sizeField, sizeRange, manualSize, manualColor, tooltipFields } = context;
  const data = queryResult.rows;
  const colorInfo = colorField ? deriveColorScaleInfo(data, colorField, colorScheme, colorBias) : null;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;
  const strokeValue = colorField && colorInfo
    ? (colorInfo.kind === 'continuous' && colorInfo.accessor
        ? (d: any) => colorInfo.accessor?.(d) ?? null
        : colorColumnName)
    : (manualColor || DEFAULT_CHART_COLOR);
  const colorScale = colorField && colorInfo
    ? (colorInfo.kind === 'continuous'
        ? {
            type: 'linear',
            domain: colorInfo.domain as [number, number],
            range: colorInfo.range,
            clamp: true,
            label: colorField.columnName,
          } as any
        : {
            type: 'ordinal' as any,
            domain: colorInfo.domain as any[],
            range: colorInfo.range,
            label: colorField.columnName,
          } as any)
    : undefined;

  // Compute band padding for category axes (like bar charts)
  // This controls the "thickness" of tick marks along the category axis
  // The padding value changes with manualSize: larger size → smaller padding → thicker tick marks
  const bandPadding = computeBandPaddingFromSizeField(data, sizeField, { manualSize }) ?? BAND_PADDING;

  // Guard against invalid values; accept numbers or dates (Date objects or parseable strings)
  const isNumericOrDate = (v: any) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    v instanceof Date ||
    (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  const hasValid = Array.isArray(data) && data.some((row) => isNumericOrDate(row[dimensionColumn]));
  if (!hasValid) {
    // Render empty axes so cell frame is consistent
    if (orientation === 'x') {
      return {
        x: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true } as any,
        y: { label: ' ', domain: [' '] as any, type: 'band' as any, padding: bandPadding as any },
        height: BAR_STEP_PX,
        marks: [],
      };
    } else {
      return {
        y: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true } as any,
        x: { label: ' ', domain: [' '] as any, type: 'band' as any, padding: bandPadding as any },
        width: BAR_STEP_PX,
        marks: [],
      };
    }
  }

  // Compute domain from filtered data (numbers or dates)
  const computeAxisDomain = () => {
    const values = data
      .map((row: any) => row[dimensionColumn])
      .filter((v: any) => isNumericOrDate(v));
    if (values.length === 0) return undefined;
    const sample = values[0];
    if (typeof sample === 'number') {
      const nums = values as number[];
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      return [min, max] as [number, number];
    }
    // Treat as dates
    const toDate = (v: any) => (v instanceof Date ? v : new Date(v));
    const dates = (values as any[]).map(toDate);
    const minD = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxD = new Date(Math.max(...dates.map((d) => d.getTime())));
    return [minD, maxD] as [Date, Date];
  };
  const axisDomain = computeAxisDomain();

  const dimensionLabel = labels?.dimension || dimensionColumn;
  const categoryLabel = labels?.category || categoryDimensionColumn;

  // X-orientation
  if (orientation === 'x') {
    if (categoryDimensionColumn) {
      // X-orientation with category
      const categories = Array.from(new Set(data.map((row: any) => row[categoryDimensionColumn])));
      const categoryCount = categories.length;
      
      const tickConfig = buildTickConfig(
        { x: dimensionColumn, y: categoryDimensionColumn },
        dimensionColumn,
        dimensionLabel,
        categoryDimensionColumn,
        categoryLabel,
        strokeValue,
        colorField,
        colorColumnName,
        sizeField,
        tooltipFields
      );
      
      const opts: Plot.PlotOptions = {
        x: { label: dimensionLabel, domainKey: dimensionColumn, grid: true, ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) } as any,
        y: { 
          label: categoryLabel,
          domain: categories as any,
          type: 'band' as any,
          padding: bandPadding as any,
        },
        height: Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX),
        marks: [Plot.tickX(data, tickConfig)],
      };
      
      applyColorScale(opts, colorScale);
      addCustomTooltip(opts, data, dimensionColumn, dimensionLabel, categoryDimensionColumn, categoryLabel, colorField, sizeField, tooltipFields);
      return opts;
    }
    
    // X-orientation without category (single strip)
    const tickConfig = buildTickConfig(
      { x: dimensionColumn, y: () => ' ' },
      dimensionColumn,
      dimensionLabel,
      undefined,
      undefined,
      strokeValue,
      colorField,
      colorColumnName,
      sizeField,
      tooltipFields
    );
    
    const opts: Plot.PlotOptions = {
      x: { label: dimensionLabel, domainKey: dimensionColumn, grid: true, ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) } as any,
      y: { label: ' ', domain: [' '] as any, type: 'band' as any, padding: bandPadding as any },
      height: BAR_STEP_PX,
      marks: [Plot.tickX(data, tickConfig)],
    };
    
    applyColorScale(opts, colorScale);
    addCustomTooltip(opts, data, dimensionColumn, dimensionLabel, undefined, undefined, colorField, sizeField, tooltipFields);
    return opts;
  }

  // Y-orientation
  if (categoryDimensionColumn) {
    // Y-orientation with category
    const categories = Array.from(new Set(data.map((row: any) => row[categoryDimensionColumn])));
    const categoryCount = categories.length;
    
    const tickConfig = buildTickConfig(
      { y: dimensionColumn, x: categoryDimensionColumn },
      dimensionColumn,
      dimensionLabel,
      categoryDimensionColumn,
      categoryLabel,
      strokeValue,
      colorField,
      colorColumnName,
      sizeField,
      tooltipFields
    );
    
    const opts: Plot.PlotOptions = {
      y: { label: dimensionLabel, domainKey: dimensionColumn, grid: true, ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) } as any,
      x: { 
        label: categoryLabel,
        domain: categories as any,
        type: 'band' as any,
        padding: bandPadding as any,
      },
      width: Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX),
      marks: [Plot.tickY(data, tickConfig)],
    };
    
    applyColorScale(opts, colorScale);
    addCustomTooltip(opts, data, dimensionColumn, dimensionLabel, categoryDimensionColumn, categoryLabel, colorField, sizeField, tooltipFields);
    return opts;
  }
  
  // Y-orientation without category (single strip)
  const tickConfig = buildTickConfig(
    { y: dimensionColumn, x: () => ' ' },
    dimensionColumn,
    dimensionLabel,
    undefined,
    undefined,
    strokeValue,
    colorField,
    colorColumnName,
    sizeField,
    tooltipFields
  );
  
  const opts: Plot.PlotOptions = {
    y: { label: dimensionLabel, domainKey: dimensionColumn, grid: true, ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) } as any,
    x: { label: ' ', domain: [' '] as any, type: 'band' as any, padding: bandPadding as any },
    width: BAR_STEP_PX,
    marks: [Plot.tickY(data, tickConfig)],
  };
  
  applyColorScale(opts, colorScale);
  addCustomTooltip(opts, data, dimensionColumn, dimensionLabel, undefined, undefined, colorField, sizeField, tooltipFields);
  return opts;
}
