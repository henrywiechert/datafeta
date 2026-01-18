import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { 
  BAR_STEP_PX, 
  DEFAULT_CHART_COLOR, 
  BAND_PADDING,
  GANTT_UNIT_PX,
  MIN_GANTT_WIDTH_PX,
  MAX_GANTT_WIDTH_PX
} from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
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
 * Add custom tooltip configuration to plot options
 */
function addCustomTooltip(
  opts: Plot.PlotOptions,
  data: any[],
  startColumn: string,
  startLabel: string,
  durationColumn: string | undefined,
  durationLabel: string | undefined,
  categoryColumn: string | undefined,
  categoryLabel: string | undefined,
  colorField: Field | undefined,
  tooltipFields: Field[] | undefined
): void {
  const mainFields: { label: string; column: string }[] = [
    { label: startLabel, column: startColumn }
  ];
  
  if (durationColumn && durationLabel) {
    mainFields.push({ label: durationLabel, column: durationColumn });
  }
  
  if (categoryColumn && categoryLabel) {
    mainFields.push({ label: categoryLabel, column: categoryColumn });
  }
  
  (opts as any).__customTooltip = {
    enabled: true,
    data: data,
    getFields: createTooltipFieldsGetter(
      mainFields,
      colorField,
      undefined, // sizeField is used for duration, not size encoding
      tooltipFields
    )
  };
}

/**
 * Compute the end value (x2 or y2) for a data row.
 * Handles missing/invalid duration values gracefully.
 */
function computeEndValue(
  startValue: number,
  durationValue: any,
  fallbackDuration: number = 0
): number {
  if (typeof durationValue === 'number' && Number.isFinite(durationValue)) {
    // Clamp negative durations to 0
    const safeDuration = Math.max(0, durationValue);
    return startValue + safeDuration;
  }
  // Fallback for null/undefined/invalid duration
  return startValue + fallbackDuration;
}

/**
 * Compute the domain for Gantt chart axis, accounting for both start and end values.
 * This is different from other charts because we need to include x2 (start + duration).
 */
function computeGanttDomain(
  data: any[],
  startColumn: string,
  durationColumn: string | undefined,
  sharedDomain?: [number, number]
): [number, number] | undefined {
  // Use shared domain if available
  if (sharedDomain) {
    return sharedDomain;
  }
  
  if (!Array.isArray(data) || data.length === 0) {
    return undefined;
  }
  
  let minStart = Infinity;
  let maxEnd = -Infinity;
  
  for (const row of data) {
    const start = row[startColumn];
    if (typeof start === 'number' && Number.isFinite(start)) {
      if (start < minStart) minStart = start;
      
      // Compute end value
      const duration = durationColumn ? row[durationColumn] : 0;
      const end = computeEndValue(start, duration, 0);
      if (end > maxEnd) maxEnd = end;
      
      // Also check start as potential max (in case duration is 0 or negative)
      if (start > maxEnd) maxEnd = start;
    }
  }
  
  if (minStart === Infinity || maxEnd === -Infinity) {
    return undefined;
  }
  
  // Add small padding (5%)
  const range = maxEnd - minStart;
  const padding = range * 0.05;
  return [minStart - padding, maxEnd + padding];
}

/**
 * Compute intrinsic width for Gantt chart based on data range.
 * Designed for future zoom support - accepts optional zoomLevel parameter.
 */
export function computeGanttIntrinsicSize(
  domain: [number, number] | undefined,
  zoomLevel: number = 1.0
): number {
  if (!domain) {
    return MIN_GANTT_WIDTH_PX;
  }
  
  const [minVal, maxVal] = domain;
  const dataRange = maxVal - minVal;
  
  if (dataRange <= 0) {
    return MIN_GANTT_WIDTH_PX;
  }
  
  const effectivePixelsPerUnit = GANTT_UNIT_PX * zoomLevel;
  const intrinsicSize = dataRange * effectivePixelsPerUnit;
  
  return Math.max(MIN_GANTT_WIDTH_PX, Math.min(MAX_GANTT_WIDTH_PX, intrinsicSize));
}

/**
 * Create hover dot configuration for better tooltip detection
 */
function createHoverDotConfig(
  orientation: 'x' | 'y',
  startColumn: string,
  durationColumn: string | undefined,
  categoryColumn: string | undefined
): any {
  const config: any = {
    r: 6,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
  };
  
  // Position dots at the center of each bar
  if (orientation === 'x') {
    // For horizontal Gantt, x is at midpoint of bar
    config.x = durationColumn 
      ? (d: any) => {
          const start = d[startColumn];
          const end = computeEndValue(start, d[durationColumn], 0);
          return (start + end) / 2;
        }
      : startColumn;
    config.y = categoryColumn || (() => ' ');
  } else {
    // For vertical Gantt, y is at midpoint of bar
    config.y = durationColumn
      ? (d: any) => {
          const start = d[startColumn];
          const end = computeEndValue(start, d[durationColumn], 0);
          return (start + end) / 2;
        }
      : startColumn;
    config.x = categoryColumn || (() => ' ');
  }
  
  return config;
}

// ---------- Main Function ---------------------------------------------------------

export interface GanttChartResult {
  options: Plot.PlotOptions;
  intrinsicSize: number; // Width for ganttX, height for ganttY
}

/**
 * Gantt chart for interval visualization.
 * 
 * Orientation rules:
 * - 'x': Horizontal Gantt - start position on X-axis, categories on Y-axis (most common)
 * - 'y': Vertical Gantt - start position on Y-axis, categories on X-axis
 * 
 * The size field is used as DURATION (not thickness like bar/tick charts).
 * Band padding for bar thickness uses manualSize only.
 * 
 * @param context - Chart generation context
 * @param orientation - 'x' for horizontal (typical), 'y' for vertical
 * @param startColumn - Column name for start values (continuous)
 * @param durationColumn - Column name for duration values (from size field)
 * @param categoryColumn - Optional column name for category axis (task names)
 * @param labels - Optional axis labels
 * @param sharedDomains - Optional shared domains for consistent scales across facets
 * @param zoomLevel - Optional zoom level multiplier for intrinsic size (default 1.0)
 */
export function ganttChart(
  context: ChartGenerationContext,
  orientation: 'x' | 'y',
  startColumn: string,
  durationColumn?: string,
  categoryColumn?: string,
  labels?: { start?: string; duration?: string; category?: string },
  sharedDomains?: Domains,
  zoomLevel: number = 1.0
): GanttChartResult {
  const { queryResult, colorField, colorScheme, colorBias, manualSize, manualColor, tooltipFields } = context;
  const data = queryResult.rows;
  
  // Color configuration
  const colorInfo = colorField ? deriveColorScaleInfo(data, colorField, colorScheme, colorBias) : null;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;
  const fillValue = colorField && colorInfo
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

  // Band padding for category axis (bar thickness)
  // Note: sizeField is used for duration, so only manualSize affects thickness
  // For Gantt, we want thicker bars by default (lower padding = thicker bars)
  // manualSize range is 1-50, where 1 = thinnest, 50 = thickest
  // Default to middle-thick bars (manualSize ~25 equivalent, padding ~0.1)
  const DEFAULT_GANTT_PADDING = 0.1; // Thicker bars by default
  const bandPadding = manualSize !== undefined
    ? computeBandPaddingFromSizeField(data, undefined, { manualSize })!
    : DEFAULT_GANTT_PADDING;

  // Get or compute categories
  const categories = categoryColumn 
    ? (sharedDomains?.[categoryColumn] as any[] ?? Array.from(new Set(data.map((row: any) => row[categoryColumn]))))
    : [' '];
  const categoryCount = categories.length;

  // Compute domain for the continuous axis (start + duration)
  const sharedStartDomain = sharedDomains?.[startColumn] as [number, number] | undefined;
  const axisDomain = computeGanttDomain(data, startColumn, durationColumn, sharedStartDomain);
  
  // Compute intrinsic size based on data range
  const intrinsicSize = computeGanttIntrinsicSize(axisDomain, zoomLevel);

  // Labels
  const startLabel = labels?.start || startColumn;
  const durationLabel = labels?.duration || durationColumn;
  const categoryLabel = labels?.category || categoryColumn;

  // Guard against empty/invalid data
  const hasValidData = Array.isArray(data) && data.some((row) => {
    const start = row[startColumn];
    return typeof start === 'number' && Number.isFinite(start);
  });

  if (!hasValidData) {
    // Render empty axes for consistency
    const emptyOpts: Plot.PlotOptions = orientation === 'x'
      ? {
          x: { label: startLabel, grid: true } as any,
          y: { label: categoryLabel || ' ', domain: categories as any, type: 'band' as any, padding: bandPadding as any },
          marks: [],
        }
      : {
          y: { label: startLabel, grid: true } as any,
          x: { label: categoryLabel || ' ', domain: categories as any, type: 'band' as any, padding: bandPadding as any },
          marks: [],
        };
    return { options: emptyOpts, intrinsicSize: MIN_GANTT_WIDTH_PX };
  }

  // Build bar mark configuration using x1/x2 (or y1/y2) for intervals
  let opts: Plot.PlotOptions;

  if (orientation === 'x') {
    // Horizontal Gantt: bars extend along X axis
    const barConfig: any = {
      x1: startColumn,
      x2: durationColumn 
        ? (d: any) => computeEndValue(d[startColumn], d[durationColumn], 0)
        : (d: any) => d[startColumn], // Zero-width if no duration
      y: categoryColumn || (() => ' '),
      fill: fillValue,
    };

    const hoverDotConfig = createHoverDotConfig(orientation, startColumn, durationColumn, categoryColumn);

    opts = {
      x: { 
        label: startLabel, 
        grid: true,
        ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {})
      } as any,
      y: { 
        label: categoryLabel || ' ',
        domain: categories as any,
        type: 'band' as any,
        padding: bandPadding as any,
      },
      marks: [
        Plot.barX(data, barConfig),
        Plot.dot(data, hoverDotConfig),
      ],
    };
  } else {
    // Vertical Gantt: bars extend along Y axis
    const barConfig: any = {
      y1: startColumn,
      y2: durationColumn 
        ? (d: any) => computeEndValue(d[startColumn], d[durationColumn], 0)
        : (d: any) => d[startColumn], // Zero-width if no duration
      x: categoryColumn || (() => ' '),
      fill: fillValue,
    };

    const hoverDotConfig = createHoverDotConfig(orientation, startColumn, durationColumn, categoryColumn);

    opts = {
      y: { 
        label: startLabel, 
        grid: true,
        ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {})
      } as any,
      x: { 
        label: categoryLabel || ' ',
        domain: categories as any,
        type: 'band' as any,
        padding: bandPadding as any,
      },
      marks: [
        Plot.barY(data, barConfig),
        Plot.dot(data, hoverDotConfig),
      ],
    };
  }

  // Apply color scale
  applyColorScale(opts, colorScale);

  // Add custom tooltip
  addCustomTooltip(
    opts,
    data,
    startColumn,
    startLabel,
    durationColumn,
    durationLabel,
    categoryColumn,
    categoryLabel,
    colorField,
    tooltipFields
  );

  return { options: opts, intrinsicSize };
}
