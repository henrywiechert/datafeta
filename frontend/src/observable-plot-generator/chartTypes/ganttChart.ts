// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, LabelConfig } from '../types';
import { ViewportRange, cullRange, declareViewportAxis } from '../viewport/chartViewport';
import { GANTT_EDGE_DOT_START_CLASS, GANTT_EDGE_DOT_END_CLASS } from './ganttEdgeDotClasses';
import { 
  BAR_STEP_PX, 
  DEFAULT_CHART_COLOR, 
  GANTT_UNIT_PX,
  MIN_GANTT_WIDTH_PX,
  MAX_GANTT_WIDTH_PX,
  MIN_GANTT_BAR_PX
} from '../../config/chartLayoutConfig';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo, resolveContextColorChannel } from '../utils/colorSchemeUtils';
import { computeBandPaddingFromSizeField } from './barCore';
import { Field } from '../../types';
import { createTooltipFieldsGetter, RECT_HOVER_PROXY_CLASS } from '../utils/tooltipUtils';
import { 
  prepareLabelData, 
  createLabelMark, 
  buildLabelStringFromFields, 
  formatValue,
  LabelSamplingConfig 
} from '../utils/labelUtils';

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
 * Filter data to only include rows that overlap with the given range.
 * A row overlaps if its interval [start, end] intersects [zoomMin, zoomMax].
 */
function filterDataForZoomRange(
  data: any[],
  startColumn: string,
  durationColumn: string | undefined,
  zoomRange: ViewportRange
): any[] {
  const { min: zoomMin, max: zoomMax } = zoomRange;
  
  return data.filter((row) => {
    const start = row[startColumn];
    if (typeof start !== 'number' || !Number.isFinite(start)) {
      return false;
    }
    
    const duration = durationColumn ? row[durationColumn] : 0;
    const end = computeEndValue(start, duration, 0);
    
    // Check if interval [start, end] overlaps [zoomMin, zoomMax]
    // Overlaps if: start < zoomMax && end > zoomMin
    return start < zoomMax && end > zoomMin;
  });
}

/**
 * Create a clamped x2/y2 accessor that clamps bar endpoints to the cull window.
 * Keeps SVG coordinates bounded when a long bar is viewed at deep zoom.
 */
function createClampedEndAccessor(
  startColumn: string,
  durationColumn: string | undefined,
  zoomRange: ViewportRange | null
): (d: any) => number {
  return (d: any) => {
    const start = d[startColumn];
    const duration = durationColumn ? d[durationColumn] : 0;
    const end = computeEndValue(start, duration, 0);
    
    if (zoomRange) {
      // Clamp end value to zoom range
      return Math.min(Math.max(end, zoomRange.min), zoomRange.max);
    }
    return end;
  };
}

/**
 * Create a clamped x1/y1 accessor that clamps bar start to the cull window.
 */
function createClampedStartAccessor(
  startColumn: string,
  zoomRange: ViewportRange | null
): ((d: any) => number) | string {
  if (!zoomRange) {
    return startColumn;
  }
  
  return (d: any) => {
    const start = d[startColumn];
    if (typeof start !== 'number' || !Number.isFinite(start)) {
      return start;
    }
    // Clamp start value to zoom range
    return Math.max(start, zoomRange.min);
  };
}

/**
 * Render transform that stretches bars shorter than MIN_GANTT_BAR_PX along the
 * timeline axis (centered on the original interval). Without it, short or
 * zero-duration events shrink below a pixel and vanish when zoomed out.
 */
function createMinBarLengthRender(axis: 'x' | 'y'): Plot.RenderFunction {
  const key1 = `${axis}1`;
  const key2 = `${axis}2`;
  return (index, scales, values, dimensions, context, next) => {
    const v1 = values[key1];
    const v2 = values[key2];
    if (!next || !v1 || !v2) {
      return next ? next(index, scales, values, dimensions, context) : null;
    }
    const p1 = Float64Array.from(v1 as ArrayLike<number>);
    const p2 = Float64Array.from(v2 as ArrayLike<number>);
    const half = MIN_GANTT_BAR_PX / 2;
    for (const i of index) {
      const a = p1[i];
      const b = p2[i];
      // NaN (invalid rows) fails this comparison and is left untouched
      if (Math.abs(b - a) < MIN_GANTT_BAR_PX) {
        const mid = (a + b) / 2;
        const dir = b >= a ? 1 : -1;
        p1[i] = mid - dir * half;
        p2[i] = mid + dir * half;
      }
    }
    return next(index, scales, { ...values, [key1]: p1, [key2]: p2 } as any, dimensions, context);
  };
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
 * Create hover dot configuration for better tooltip detection.
 * The dot only enlarges the hover target of short bars; the tooltip listener
 * highlights the bar itself (RECT_HOVER_PROXY_CLASS).
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
    className: RECT_HOVER_PROXY_CLASS,
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

/** Classes tagging the invisible start/end snap-target dots added by {@link createEdgeDotConfigs}. */
export { GANTT_EDGE_DOT_START_CLASS, GANTT_EDGE_DOT_END_CLASS } from './ganttEdgeDotClasses';

/**
 * Create invisible dot marks anchored at each bar's start (x1/y1) and end
 * (x2/y2), carrying the same datum as the bar. These are snap targets for
 * future pointer-driven features (e.g. span measurement) rather than
 * tooltip targets: `overlay-no-tooltip` keeps them out of the existing
 * hover-tooltip mark selection (see queryDataMarkElements), which already
 * has a dedicated midpoint dot via createHoverDotConfig.
 *
 * `pointerEvents: 'none'` is essential, not cosmetic: like the midpoint hover
 * dot, these use `fill: 'transparent'` (painted-but-invisible) rather than
 * `fill: 'none'`, which SVG's default `pointer-events: visiblePainted` would
 * otherwise still hit-test on every mousemove across the whole chart. Future
 * snap logic reads their cx/cy/datum directly from the DOM, not via events.
 */
function createEdgeDotConfigs(
  orientation: 'x' | 'y',
  startColumn: string,
  durationColumn: string | undefined,
  categoryColumn: string | undefined,
  zoomRange: ViewportRange | null
): { start: any; end: any } {
  const base: any = {
    r: 4,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
    pointerEvents: 'none',
  };


  const startAccessor = createClampedStartAccessor(startColumn, zoomRange);
  const endAccessor = createClampedEndAccessor(startColumn, durationColumn, zoomRange);
  const categoryAccessor = categoryColumn || (() => ' ');

  if (orientation === 'x') {
    return {
      start: { ...base, x: startAccessor, y: categoryAccessor, className: `${GANTT_EDGE_DOT_START_CLASS} overlay-no-tooltip` },
      end: { ...base, x: endAccessor, y: categoryAccessor, className: `${GANTT_EDGE_DOT_END_CLASS} overlay-no-tooltip` },
    };
  }
  return {
    start: { ...base, y: startAccessor, x: categoryAccessor, className: `${GANTT_EDGE_DOT_START_CLASS} overlay-no-tooltip` },
    end: { ...base, y: endAccessor, x: categoryAccessor, className: `${GANTT_EDGE_DOT_END_CLASS} overlay-no-tooltip` },
  };
}

/** The timeline axis is pannable/zoomable; its natural domain bounds the viewport. */
function declareGanttViewport(
  opts: Plot.PlotOptions,
  orientation: 'x' | 'y',
  startColumn: string,
  axisDomain: [number, number] | undefined
): void {
  if (!axisDomain) return;
  declareViewportAxis(opts, orientation, { column: startColumn, extent: axisDomain, temporal: false });
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
 * @param labelCfg - Optional label configuration for data labels on bars
 */
export function ganttChart(
  context: ChartGenerationContext,
  orientation: 'x' | 'y',
  startColumn: string,
  durationColumn?: string,
  categoryColumn?: string,
  labels?: { start?: string; duration?: string; category?: string },
  sharedDomains?: Domains,
  zoomLevel: number = 1.0,
  labelCfg?: LabelConfig
): GanttChartResult {
  const { queryResult, manualSize, tooltipFields, chartViewport } = context;
  const color = resolveContextColorChannel(context);
  const colorField = color.field ?? undefined;
  const manualColor = color.manual || undefined;
  const rawData = queryResult.rows;
  
  // When a viewport is active on the timeline, keep only rows overlapping the
  // cull window (viewport plus one span each side) and clamp bars to it. The
  // viewport itself becomes the axis domain in applyChartViewport.
  const viewportRange = chartViewport?.[startColumn];
  const cullWindow: ViewportRange | null = viewportRange ? cullRange(viewportRange) : null;
  const data = cullWindow
    ? filterDataForZoomRange(rawData, startColumn, durationColumn, cullWindow)
    : rawData;
  
  // Color configuration (use rawData for color domain computation to maintain consistency)
  const colorInfo = colorField
    ? deriveColorScaleInfo(rawData, resolveContextColorChannel(context))
    : null;
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
            label: getFieldDisplayName(colorField),
          } as any
        : {
            type: 'ordinal' as any,
            domain: colorInfo.domain as any[],
            range: colorInfo.range,
            label: getFieldDisplayName(colorField),
          } as any)
    : undefined;

  // Band padding for category axis (bar thickness)
  // Note: sizeField is used for duration, so only manualSize affects thickness
  // For Gantt, we want thicker bars by default (lower padding = thicker bars)
  // manualSize range is 1-50, where 1 = thinnest, 50 = thickest
  // Default to middle-thick bars (manualSize ~25 equivalent, padding ~0.1)
  const DEFAULT_GANTT_PADDING = 0.1; // Thicker bars by default
  const bandPadding = manualSize !== undefined
    ? computeBandPaddingFromSizeField(rawData, undefined, { manualSize })!
    : DEFAULT_GANTT_PADDING;

  // Get or compute categories from FULL data (rawData) to ensure all categories
  // remain visible even when zoomed to a range where some categories have no events
  const categories = categoryColumn 
    ? (sharedDomains?.[categoryColumn] as any[] ?? Array.from(new Set(rawData.map((row: any) => row[categoryColumn]))))
    : [' '];
  const categoryCount = categories.length;

  // Natural domain of the continuous axis (start + duration) over the full
  // data; it is also the viewport's zoom-out limit.
  const sharedStartDomain = sharedDomains?.[startColumn] as [number, number] | undefined;
  const axisDomain = computeGanttDomain(rawData, startColumn, durationColumn, sharedStartDomain);
  const intrinsicSize = computeGanttIntrinsicSize(axisDomain, zoomLevel);

  // Labels
  const startLabel = labels?.start || startColumn;
  const durationLabel = labels?.duration || durationColumn;
  const categoryLabel = labels?.category || categoryColumn;

  // Guard against empty/invalid data
  // Note: When zoomed, data may be filtered to only rows in the zoom range
  // hasValidData refers to whether we have data to render marks for
  const hasValidData = Array.isArray(data) && data.some((row) => {
    const start = row[startColumn];
    return typeof start === 'number' && Number.isFinite(start);
  });

  if (!hasValidData) {
    // Render empty axes for consistency
    // When zoomed, use the zoom range as the axis domain and maintain intrinsic size
    // This ensures facets without data in the zoom range still show proper axes
    const emptyOpts: Plot.PlotOptions = orientation === 'x'
      ? {
          x: { 
            label: startLabel, 
            domainKey: startColumn,
            grid: true,
            ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {})
          } as any,
          y: { label: categoryLabel || ' ', domain: categories as any, type: 'band' as any, padding: bandPadding as any },
          marks: [],
        }
      : {
          y: { 
            label: startLabel, 
            domainKey: startColumn,
            grid: true,
            ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {})
          } as any,
          x: { label: categoryLabel || ' ', domain: categories as any, type: 'band' as any, padding: bandPadding as any },
          marks: [],
        };
    declareGanttViewport(emptyOpts, orientation, startColumn, axisDomain);
    return { options: emptyOpts, intrinsicSize };
  }

  // Build bar mark configuration using x1/x2 (or y1/y2) for intervals
  // When zoom is active, clamp bar endpoints to zoom boundaries
  let opts: Plot.PlotOptions;

  if (orientation === 'x') {
    // Horizontal Gantt: bars extend along X axis
    const barConfig: any = {
      x1: createClampedStartAccessor(startColumn, cullWindow),
      x2: createClampedEndAccessor(startColumn, durationColumn, cullWindow),
      y: categoryColumn || (() => ' '),
      fill: fillValue,
      render: createMinBarLengthRender('x'),
    };

    const hoverDotConfig = createHoverDotConfig(orientation, startColumn, durationColumn, categoryColumn);
    const edgeDotConfigs = createEdgeDotConfigs(orientation, startColumn, durationColumn, categoryColumn, cullWindow);

    opts = {
      x: { 
        label: startLabel, 
        domainKey: startColumn,
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
        Plot.dot(data, edgeDotConfigs.start),
        Plot.dot(data, edgeDotConfigs.end),
      ],
    };
  } else {
    // Vertical Gantt: bars extend along Y axis
    const barConfig: any = {
      y1: createClampedStartAccessor(startColumn, cullWindow),
      y2: createClampedEndAccessor(startColumn, durationColumn, cullWindow),
      x: categoryColumn || (() => ' '),
      fill: fillValue,
      render: createMinBarLengthRender('y'),
    };

    const hoverDotConfig = createHoverDotConfig(orientation, startColumn, durationColumn, categoryColumn);
    const edgeDotConfigs = createEdgeDotConfigs(orientation, startColumn, durationColumn, categoryColumn, cullWindow);

    opts = {
      y: { 
        label: startLabel, 
        domainKey: startColumn,
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
        Plot.dot(data, edgeDotConfigs.start),
        Plot.dot(data, edgeDotConfigs.end),
      ],
    };
  }

  declareGanttViewport(opts, orientation, startColumn, axisDomain);

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

  // Add data labels if enabled
  if (labelCfg && labelCfg.labelsEnabled) {
    // Prepare label data with sampling
    const samplingConfig: LabelSamplingConfig = {
      data,
      labelsEnabled: labelCfg.labelsEnabled,
      samplingStrategy: labelCfg.samplingStrategy,
      samplingThreshold: labelCfg.samplingThreshold,
      sampleEvery: labelCfg.sampleEvery,
      supportsSampling: true, // Gantt supports sampling
    };
    const prepared = prepareLabelData(samplingConfig);
    
    if (prepared.shouldRender) {
      // Gantt-specific label text builder
      const getText = (d: any): string => {
        // First try explicit label fields
        const fromFields = buildLabelStringFromFields(d, labelCfg.labelFields);
        if (fromFields.length > 0) {
          return fromFields;
        }
        // Default: show duration value
        if (durationColumn && d[durationColumn] !== undefined) {
          return formatValue(d[durationColumn]);
        }
        return '';
      };
      
      // Gantt-specific label positioning: center of each bar
      const isHorizontal = orientation === 'x';
      const categoryCol = categoryColumn || '__single_category';
      
      const labelMark = createLabelMark({
        data: prepared.data,
        getText,
        // Position at midpoint of bar
        x: isHorizontal
          ? (durationColumn
              ? (d: any) => {
                  const start = d[startColumn];
                  const duration = d[durationColumn];
                  return typeof start === 'number' && typeof duration === 'number'
                    ? start + duration / 2
                    : start;
                }
              : startColumn)
          : categoryCol,
        y: isHorizontal
          ? categoryCol
          : (durationColumn
              ? (d: any) => {
                  const start = d[startColumn];
                  const duration = d[durationColumn];
                  return typeof start === 'number' && typeof duration === 'number'
                    ? start + duration / 2
                    : start;
                }
              : startColumn),
        withHalo: true,
        fontSize: labelCfg.fontSize,
      });
      
      if (labelMark) {
        (opts.marks = opts.marks || []).push(labelMark as any);
      }
    }
  }

  const thicknessScale = context.bandThicknessScale ?? 1;

  // Set the category axis dimension based on category count
  // This ensures consistent sizing similar to bar/tick-strip charts
  // Timeline axis uses 'fr' (not set here), category axis uses fixed size per category
  const categoryAxisSize = Math.max(BAR_STEP_PX, categoryCount * BAR_STEP_PX) * thicknessScale;
  if (orientation === 'x') {
    // Horizontal Gantt: category axis is Y, so set height
    opts.height = categoryAxisSize;
  } else {
    // Vertical Gantt: category axis is X, so set width
    opts.width = categoryAxisSize;
  }

  return { options: opts, intrinsicSize };
}
