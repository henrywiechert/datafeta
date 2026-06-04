// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING } from '../../config/chartLayoutConfig';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo, resolveContextColorChannel } from '../utils/colorSchemeUtils';
import { computeBandPaddingFromSizeField } from './barCore';
import { Field } from '../../types';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';

type Domains = Record<string, [number, number] | [Date, Date] | any[]> | undefined;

// ---------- Helper Functions ---------------------------------------------------------

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
 * Add custom tooltip configuration to plot options (color is read directly from DOM)
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
    data: data,
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

/**
 * Create hover dot configuration for better tooltip detection
 */
function createHoverDotConfig(
  orientation: 'x' | 'y',
  dimensionColumn: string,
  categoryDimensionColumn: string | undefined
): any {
  const config: any = {
    r: 6,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
  };
  
  if (orientation === 'x') {
    config.x = dimensionColumn;
    config.y = categoryDimensionColumn || (() => ' ');
  } else {
    config.y = dimensionColumn;
    config.x = categoryDimensionColumn || (() => ' ');
  }
  
  return config;
}

/**
 * Build plot options for tick strip chart
 */
function buildPlotOptions(
  orientation: 'x' | 'y',
  data: any[],
  dimensionColumn: string,
  dimensionLabel: string,
  categoryDimensionColumn: string | undefined,
  categoryLabel: string | undefined,
  axisDomain: [number, number] | [Date, Date] | undefined,
  bandPadding: number,
  thicknessScale: number,
  tickConfig: any,
  hoverDotConfig: any,
  colorScale: any,
  colorField: Field | undefined,
  sizeField: Field | undefined,
  tooltipFields: Field[] | undefined,
  sharedCategoryDomain?: any[],
  categoryTickFormat?: (d: any) => string
): Plot.PlotOptions {
  // Use shared category domain if available, otherwise compute from local data
  const categories = categoryDimensionColumn 
    ? (sharedCategoryDomain && Array.isArray(sharedCategoryDomain) && sharedCategoryDomain.length > 0
        ? sharedCategoryDomain
        : Array.from(new Set(data.map((row: any) => row[categoryDimensionColumn]))))
    : undefined;
  const categoryCount = categories?.length || 1;
  const categoryAxisSize = Math.max(BAR_STEP_PX, categoryCount * BAR_STEP_PX) * thicknessScale;
  
  let opts: Plot.PlotOptions;
  
  // NOTE: We intentionally do NOT set explicit height/width here in the default case,
  // but we do apply a scaled category-axis size to mimic facet-resize behavior when desired.
  
  if (orientation === 'x') {
    const markType = Plot.tickX;
    opts = {
      x: { 
        label: dimensionLabel, 
        domainKey: dimensionColumn, 
        grid: true, 
        ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) 
      } as any,
      y: categoryDimensionColumn 
        ? { 
            label: categoryLabel,
            domain: categories as any,
            type: 'band' as any,
            padding: bandPadding as any,
            ...(categoryTickFormat ? { tickFormat: categoryTickFormat } : {}),
          }
        : {
            label: ' ',
            domain: [' '] as any,
            type: 'band' as any,
            padding: bandPadding as any,
            ...(categoryTickFormat ? { tickFormat: categoryTickFormat } : {}),
          },
      // Size handled by layout system, not here - enables resize handles
      marks: [markType(data, tickConfig), Plot.dot(data, hoverDotConfig)],
    };
    opts.height = categoryAxisSize;
  } else {
    const markType = Plot.tickY;
    opts = {
      y: { 
        label: dimensionLabel, 
        domainKey: dimensionColumn, 
        grid: true, 
        ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) 
      } as any,
      x: categoryDimensionColumn 
        ? { 
            label: categoryLabel,
            domain: categories as any,
            type: 'band' as any,
            padding: bandPadding as any,
            ...(categoryTickFormat ? { tickFormat: categoryTickFormat } : {}),
          }
        : {
            label: ' ',
            domain: [' '] as any,
            type: 'band' as any,
            padding: bandPadding as any,
            ...(categoryTickFormat ? { tickFormat: categoryTickFormat } : {}),
          },
      // Size handled by layout system, not here - enables resize handles
      marks: [markType(data, tickConfig), Plot.dot(data, hoverDotConfig)],
    };
    opts.width = categoryAxisSize;
  }
  
  applyColorScale(opts, colorScale);
  addCustomTooltip(opts, data, dimensionColumn, dimensionLabel, categoryDimensionColumn, categoryLabel, colorField, sizeField, tooltipFields);
  
  return opts;
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
  labels?: { dimension?: string; category?: string },
  sharedDomains?: Domains
): Plot.PlotOptions {
  const { queryResult, colorField, sizeField, manualSize, manualColor, tooltipFields, bandThicknessScale, xTickFormat, yTickFormat } = context;
  const data = queryResult.rows;
  const categoryTickFormat = orientation === 'x' ? yTickFormat : xTickFormat;
  const colorInfo = colorField
    ? deriveColorScaleInfo(data, resolveContextColorChannel(context))
    : null;
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
            label: getFieldDisplayName(colorField),
          } as any
        : {
            type: 'ordinal' as any,
            domain: colorInfo.domain as any[],
            range: colorInfo.range,
            label: getFieldDisplayName(colorField),
          } as any)
    : undefined;

  // Compute band padding for category axes (like bar charts)
  // This controls the "thickness" of tick marks along the category axis
  // For tick-strip, we IGNORE the sizeField and only use manualSize slider for thickness control
  // (sizeField semantics don't apply to tick marks - they're points, not sized by data)
  const bandPadding = computeBandPaddingFromSizeField(data, undefined, { manualSize }) ?? BAND_PADDING;

  // Guard against invalid values; accept numbers or dates (Date objects or parseable strings)
  const isNumericOrDate = (v: any) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    v instanceof Date ||
    (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  const hasValid = Array.isArray(data) && data.some((row) => isNumericOrDate(row[dimensionColumn]));
  if (!hasValid) {
    // Render empty axes so cell frame is consistent
    // Size is handled by layout system, not here - enables resize handles
    if (orientation === 'x') {
      return {
        x: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true } as any,
        y: {
          label: ' ',
          domain: [' '] as any,
          type: 'band' as any,
          padding: bandPadding as any,
          ...(categoryTickFormat ? { tickFormat: categoryTickFormat } : {}),
        },
        marks: [],
      };
    } else {
      return {
        y: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true } as any,
        x: {
          label: ' ',
          domain: [' '] as any,
          type: 'band' as any,
          padding: bandPadding as any,
          ...(categoryTickFormat ? { tickFormat: categoryTickFormat } : {}),
        },
        marks: [],
      };
    }
  }

  // First check for shared domain (for faceted charts)
  const sharedAxisDomain = sharedDomains?.[dimensionColumn] as [number, number] | [Date, Date] | undefined;
  
  // Compute domain from filtered data (numbers or dates) if no shared domain
  const computeAxisDomain = (): [number, number] | [Date, Date] | undefined => {
    // Use shared domain if available
    if (sharedAxisDomain && Array.isArray(sharedAxisDomain) && sharedAxisDomain.length === 2) {
      return sharedAxisDomain;
    }
    
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
  
  // Also check for shared category domain
  const sharedCategoryDomain = categoryDimensionColumn 
    ? sharedDomains?.[categoryDimensionColumn] as any[] | undefined 
    : undefined;

  const dimensionLabel = labels?.dimension || dimensionColumn;
  const categoryLabel = labels?.category || categoryDimensionColumn;

  // Build tick configuration
  const baseConfig = orientation === 'x'
    ? { x: dimensionColumn, y: categoryDimensionColumn || (() => ' ') }
    : { y: dimensionColumn, x: categoryDimensionColumn || (() => ' ') };
    
  const tickConfig = buildTickConfig(
    baseConfig,
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
  
  // Create hover dot configuration for better tooltip detection
  const hoverDotConfig = createHoverDotConfig(orientation, dimensionColumn, categoryDimensionColumn);
  
  const thicknessScale = bandThicknessScale ?? 1;

  // Build and return plot options
  return buildPlotOptions(
    orientation,
    data,
    dimensionColumn,
    dimensionLabel,
    categoryDimensionColumn,
    categoryLabel,
    axisDomain,
    bandPadding,
    thicknessScale,
    tickConfig,
    hoverDotConfig,
    colorScale,
    colorField,
    sizeField,
    tooltipFields,
    sharedCategoryDomain,
    categoryTickFormat
  );
}
