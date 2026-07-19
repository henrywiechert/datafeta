// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  GridResultModel,
  getPlotGridCellAtCol,
  getPlotGridCellAtRow,
  getYAxisLabelAtRow,
  gridHasPieAxisLabels,
  usesOnlyAxislessRenderers,
} from '../../../../observable-plot-generator/gridModel';
import { MIN_GRID_ROW_PX } from '../../../../config/chartLayoutConfig';
import {
  FacetHeaderLabelStyle,
  FacetLabelStyles,
  FacetLeftValuesLabelStyle,
  FacetTopValuesLabelStyle,
  YAxisLabelStyle,
} from '../../../../contexts/VisualizationContext/types';
import { UserChartType } from '../../../../types';
import { formatFacetValue } from './facetLabelUtils';
import { formatNumericTick } from '../../../../observable-plot-generator/utils/numericTickFormat';
import type { CSSProperties } from 'react';

// Fallback only: used when real text measurement (canvas) is unavailable, e.g.
// in jsdom/SSR or before a 2D context can be created. The primary path measures
// glyphs with `measureTextPx` (real font metrics); see `estimateTextPx`.
export const TEXT_PX_PER_CHAR = 6; // conservative fallback for 12-14px font
const MIN_Y_AXIS_GUTTER_PX = 28;
const Y_AXIS_BAND_LINE_WIDTH_EM = 12;
const X_AXIS_BAND_LINE_WIDTH_EM = 6.5;
const APPROX_AXIS_FONT_PX = 10;
const MAX_Y_BAND_TICK_WIDTH_PX = Y_AXIS_BAND_LINE_WIDTH_EM * APPROX_AXIS_FONT_PX;
const MAX_X_BAND_TICK_HEIGHT_PX = X_AXIS_BAND_LINE_WIDTH_EM * APPROX_AXIS_FONT_PX;

// Font stack used for measurement. Axis/label text inherits the app's sans-serif
// font; measuring with the same family + size yields real glyph widths instead of
// a flat per-character estimate.
const MEASURE_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// A single shared 2D canvas context is reused for all text measurement. Resolved
// lazily and cached: `null` means measurement is unavailable (jsdom/SSR) and
// callers fall back to the `TEXT_PX_PER_CHAR` heuristic.
let measureContext: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext !== undefined) return measureContext;
  try {
    if (typeof document === 'undefined') {
      measureContext = null;
    } else {
      measureContext = document.createElement('canvas').getContext('2d') ?? null;
    }
  } catch {
    measureContext = null;
  }
  return measureContext;
}

/**
 * Measure the rendered pixel width of `text` at `fontSizePx` using real font
 * metrics. Returns `null` when no canvas 2D context is available so callers can
 * fall back to the character-count estimate.
 */
function measureTextPx(text: string, fontSizePx: number): number | null {
  if (text.length === 0) return 0;
  const ctx = getMeasureContext();
  if (!ctx) return null;
  ctx.font = `${fontSizePx}px ${MEASURE_FONT_FAMILY}`;
  const width = ctx.measureText(text).width;
  // jsdom's stub returns 0 for any string; treat that as "unavailable" so we
  // fall back to the heuristic rather than collapsing every gutter to its min.
  if (!Number.isFinite(width) || width <= 0) return null;
  return Math.ceil(width);
}

function estimateLongestTickPx(domain: any[]): number {
  return domain.reduce((max: number, value: any) => {
    return Math.max(max, estimateTextPx(String(value ?? '')));
  }, 0);
}

/**
 * Pixel width of axis-tick text. Primary path measures real glyph widths at the
 * approximate axis font size; falls back to a character-count estimate when no
 * canvas context is available (jsdom/SSR).
 */
export function estimateTextPx(text?: string): number {
  if (!text) return 0;
  const measured = measureTextPx(text, APPROX_AXIS_FONT_PX);
  if (measured !== null) return measured;
  return Math.ceil(text.length * TEXT_PX_PER_CHAR);
}

function estimateTextPxForFont(text: string, fontSize: number): number {
  if (!text) return 0;
  const measured = measureTextPx(text, fontSize);
  if (measured !== null) return measured;
  return Math.ceil(text.length * fontSize * 0.6);
}

// Zoom Facet reserves a wider left gutter for band (categorical) Y axes than the
// grid does: the dialog is large, so we can afford to show more of long labels
// before falling back to ellipsis.
const ZOOM_BAND_Y_FONT_PX = 14;
const ZOOM_BAND_Y_MIN_MARGIN_PX = 48;
const ZOOM_BAND_Y_MAX_MARGIN_PX = 220;
const ZOOM_BAND_Y_PADDING_PX = 12;

/**
 * Size the left margin (and Observable Plot `lineWidth`, in ems) for a band Y
 * axis in the Zoom Facet dialog. The margin fits the longest raw category label
 * at `fontSizePx`, clamped to a sensible min/max; `lineWidthEm` matches the
 * reserved text width so Plot ellipses overflow with "…" instead of hard-clipping.
 */
export function computeZoomBandYAxis(
  domain: unknown[] | undefined,
  fontSizePx: number = ZOOM_BAND_Y_FONT_PX,
): { marginPx: number; lineWidthEm: number } {
  const longest = Array.isArray(domain)
    ? domain.reduce<number>(
        (max, value) => Math.max(max, estimateTextPxForFont(String(value ?? ''), fontSizePx)),
        0,
      )
    : 0;
  const marginPx = Math.min(
    ZOOM_BAND_Y_MAX_MARGIN_PX,
    Math.max(ZOOM_BAND_Y_MIN_MARGIN_PX, longest + ZOOM_BAND_Y_PADDING_PX),
  );
  const lineWidthEm = Math.max(3, (marginPx - ZOOM_BAND_Y_PADDING_PX) / fontSizePx);
  return { marginPx, lineWidthEm };
}

// Zoom Facet band-X (vertical charts): horizontal single-line ellipsis.
// Multi-line wrapping was abandoned (Plot textOverflow/lineWidth is unreliable
// for wrap). lineWidth is sized from an assumed dialog width / category count.
const ZOOM_BAND_X_FONT_PX = 14;
const ZOOM_BAND_X_MARGIN_BOTTOM_PX = 50;
const ZOOM_BAND_X_ASSUMED_PLOT_WIDTH_PX = 900;
const ZOOM_BAND_X_SIDE_GUTTER_PX = 100;
const ZOOM_BAND_X_MIN_LINE_WIDTH_EM = 3;

/**
 * Bottom margin + Plot lineWidth (ems) for horizontal band-X tick ellipsis in Zoom.
 */
export function computeZoomBandXAxis(
  categoryCount: number = 1,
  fontSizePx: number = ZOOM_BAND_X_FONT_PX,
  plotWidthPx: number = ZOOM_BAND_X_ASSUMED_PLOT_WIDTH_PX,
): {
  marginBottomPx: number;
  lineWidthEm: number;
} {
  const count = Math.max(1, categoryCount);
  const usablePx = Math.max(120, plotWidthPx - ZOOM_BAND_X_SIDE_GUTTER_PX);
  const bandWidthPx = Math.max(24, usablePx / count);
  const lineWidthEm = Math.max(ZOOM_BAND_X_MIN_LINE_WIDTH_EM, bandWidthPx / fontSizePx);
  return { marginBottomPx: ZOOM_BAND_X_MARGIN_BOTTOM_PX, lineWidthEm };
}

function shouldUseTableHorizontalFacetValues(style: FacetLeftValuesLabelStyle): boolean {
  return style.orientation === 'vertical' && (style.orientationByDepth?.length ?? 0) === 0;
}

export function getEffectiveFacetLabelStyles(
  facetLabelStyles: FacetLabelStyles | undefined,
  globalChartType: UserChartType | null | undefined,
): FacetLabelStyles | undefined {
  if (!facetLabelStyles || globalChartType !== 'table-refactor') {
    return facetLabelStyles;
  }

  if (!shouldUseTableHorizontalFacetValues(facetLabelStyles.leftValues)) {
    return facetLabelStyles;
  }

  return {
    ...facetLabelStyles,
    leftValues: {
      ...facetLabelStyles.leftValues,
      orientation: 'horizontal',
    },
  };
}

function estimateHeaderWidthPx(text: string, style: FacetHeaderLabelStyle): number {
  const fontSize = style.fontSize;
  if (style.orientation === 'vertical') {
    return Math.ceil(fontSize * 1.8 + 8);
  }
  return estimateTextPxForFont(text, fontSize) + 12;
}

function estimateTopTrackHeightPx(
  text: string,
  fontSize: number,
  orientation: 'horizontal' | 'vertical' | 'angled',
): number {
  if (orientation === 'vertical') {
    return Math.max(Math.ceil(fontSize * 1.8 + 8), estimateTextPxForFont(text, fontSize) + 8);
  }
  if (orientation === 'angled') {
    return Math.max(Math.ceil(fontSize * 1.8 + 8), Math.ceil(estimateTextPxForFont(text, fontSize) * 0.75) + 8);
  }
  return Math.ceil(fontSize * 1.8 + 8);
}

function estimateLeftTrackWidthPx(
  text: string,
  fontSize: number,
  orientation: 'horizontal' | 'vertical',
): number {
  if (orientation === 'vertical') {
    return Math.ceil(fontSize * 1.8 + 8);
  }
  return estimateTextPxForFont(text, fontSize) + 12;
}

export function computeAutoFacetLeftHeaderWidth(
  fieldLabels: string[],
  style: FacetHeaderLabelStyle,
  fallbackSize: number,
): number {
  if (fieldLabels.length === 0) return fallbackSize;
  return fieldLabels.reduce((maxWidth, label) => {
    return Math.max(maxWidth, estimateHeaderWidthPx(label, style));
  }, fallbackSize);
}

export function computeAutoFacetTopHeaderHeight(
  fieldLabels: string[],
  style: FacetHeaderLabelStyle,
  fallbackSize: number,
): number {
  if (fieldLabels.length === 0) return fallbackSize;
  return fieldLabels.reduce((maxHeight, label) => {
    const orientation = style.orientation;
    return Math.max(maxHeight, estimateTopTrackHeightPx(label, style.fontSize, orientation));
  }, fallbackSize);
}

export function computeAutoFacetTopValueHeights(
  levels: Array<{ values: any[] }>,
  style: FacetTopValuesLabelStyle,
  fallbackSize: number,
): number[] {
  return levels.map((level, depthIndex) => {
    const orientation = style.orientationByDepth?.[depthIndex] ?? style.orientation;
    const longest = level.values.reduce((maxHeight, value) => {
      const label = formatFacetValue(value);
      return Math.max(maxHeight, estimateTopTrackHeightPx(label, style.fontSize, orientation));
    }, 0);
    return Math.max(fallbackSize, longest || 0);
  });
}

export function computeAutoFacetLeftValueWidths(
  levels: Array<{ values: any[] }>,
  style: FacetLeftValuesLabelStyle,
  fallbackSize: number,
): number[] {
  return levels.map((level, depthIndex) => {
    const orientation = style.orientationByDepth?.[depthIndex] ?? style.orientation;
    const longest = level.values.reduce((maxWidth, value) => {
      const label = formatFacetValue(value);
      return Math.max(maxWidth, estimateLeftTrackWidthPx(label, style.fontSize, orientation));
    }, 0);
    return Math.max(fallbackSize, longest || 0);
  });
}

/**
 * Calculate dynamic Y-axis gutter width based on label content
 */
export function computeDynamicYAxisGutterPx(grid: GridResultModel | null, rows: number, overrideWidthPx: number | null): number {
  if (usesOnlyAxislessRenderers(grid)) return 0;
  if (overrideWidthPx !== null) return Math.max(MIN_Y_AXIS_GUTTER_PX, overrideWidthPx);

  let maxWidth = MIN_Y_AXIS_GUTTER_PX;
  for (let r = 0; r < rows; r++) {
    const sample = getPlotGridCellAtRow(grid, r);
    const yOpts: any = sample?.content.options?.y || {};
    const yType = yOpts?.type;
    const yDomain = yOpts?.domain as any;
    let tickWidth = 0;
    if (yType === 'band' && Array.isArray(yDomain)) {
      // Categorical axis: size from raw domain values (not tickFormat). tickFormat is
      // derived from the measured gutter, so using it here would shrink the gutter each
      // render until labels disappear.
      const longest = Math.min(estimateLongestTickPx(yDomain), MAX_Y_BAND_TICK_WIDTH_PX);
      tickWidth = longest + 10; // padding
    } else if (Array.isArray(yDomain) && yDomain.length === 2) {
      // Numeric/date axis: endpoints only (ticks are generated inside ObservablePlot).
      // Numeric endpoints are sized with the same compact formatter the axis
      // renders with, so the gutter matches the actual "2M"-style labels rather
      // than the raw "2000000".
      const [a, b] = yDomain;
      const sizeEndpoint = (v: any): string =>
        typeof v === 'number' && Number.isFinite(v) ? formatNumericTick(v) : String(v);
      tickWidth = Math.max(estimateTextPx(sizeEndpoint(a)), estimateTextPx(sizeEndpoint(b))) + 6; // small padding
    }
    const rowWidth = Math.max(MIN_Y_AXIS_GUTTER_PX, tickWidth);
    if (rowWidth > maxWidth) maxWidth = rowWidth;
  }
  return maxWidth;
}

/**
 * Calculate dynamic X-axis gutter height based on label content
 */
export function computeDynamicXAxisGutterPx(grid: GridResultModel | null, columns: number, overrideHeightPx: number | null): number {
  if (usesOnlyAxislessRenderers(grid)) return 0;
  if (overrideHeightPx !== null) return Math.max(24, overrideHeightPx);

  let maxHeight = 24; // baseline
  for (let c = 0; c < columns; c++) {
    const sample = getPlotGridCellAtCol(grid, c);
    const xOpts: any = sample?.content.options?.x || {};
    const xType = xOpts?.type;
    const xDomain = xOpts?.domain as any;
    let height = 24;
    if (xType === 'band' && Array.isArray(xDomain)) {
      const visibleTickPx = Math.min(estimateLongestTickPx(xDomain), MAX_X_BAND_TICK_HEIGHT_PX);
      height = Math.max(30, 14 + visibleTickPx); // base tick + vertical label extent
    } else {
      // numeric or time, modest ticks
      height = 30;
    }
    if (height > maxHeight) maxHeight = height;
  }
  return maxHeight;
}

/** Default Y-axis label style for backwards compatibility */
const DEFAULT_Y_AXIS_LABEL_STYLE: YAxisLabelStyle = {
  fontSize: 10,
  orientation: 'vertical',
  widthPx: null,
};

/** Minimum width for Y-axis label column */
const MIN_Y_LABEL_COL_PX = 16;

/**
 * Calculate dynamic Y-label column width based on label length and available row height.
 * Supports configurable orientation and manual width override.
 */
export function computeDynamicYLabelColPx(
  grid: GridResultModel | null,
  rowHeightPx: number,
  labelStyle?: YAxisLabelStyle
): number {
  // Axis-less charts (e.g. pie) normally need no Y-label column, but a pie with
  // its measure on the Y axis still wants the shared left-side label header.
  if (usesOnlyAxislessRenderers(grid) && !gridHasPieAxisLabels(grid, 'y')) return 0;
  const style = labelStyle || DEFAULT_Y_AXIS_LABEL_STYLE;

  // If manual width override is set, use it directly
  if (style.widthPx !== null) {
    return style.widthPx;
  }

  const rows = grid?.layout.rows || 1;
  let maxLabelWidth = MIN_Y_LABEL_COL_PX;

  const fontSize = style.fontSize;
  const LINE_HEIGHT = 1.2;
  const CHAR_WIDTH_RATIO = 0.6; // Approximate character width relative to font size

  for (let r = 0; r < rows; r++) {
    const yLabel = getYAxisLabelAtRow(grid, r);

    if (yLabel && yLabel.length > 0) {
      let requiredWidth: number;

      if (style.orientation === 'horizontal') {
        const charWidth = fontSize * CHAR_WIDTH_RATIO;
        requiredWidth = yLabel.length * charWidth + 8; // Add padding
      } else {
        if (rowHeightPx > 0) {
          const charHeight = fontSize;
          const charsPerColumn = Math.max(1, Math.floor(rowHeightPx / charHeight));
          const requiredColumns = Math.ceil(yLabel.length / charsPerColumn);
          requiredWidth = requiredColumns * fontSize * LINE_HEIGHT;
        } else {
          requiredWidth = fontSize * LINE_HEIGHT;
        }
      }

      if (requiredWidth > maxLabelWidth) {
        maxLabelWidth = requiredWidth;
      }
    }
  }

  return Math.ceil(maxLabelWidth);
}

/**
 * Calculate row height based on available space and number of rows
 */
export function calculateRowHeight(available: number, rowsForSizing: number): number {
  const r = Math.max(1, rowsForSizing);
  if (available > 0) {
    return Math.max(MIN_GRID_ROW_PX, Math.floor(available / r));
  }
  return MIN_GRID_ROW_PX;
}

/**
 * Calculate total content width based on column configuration
 */
export function computeTotalContentWidth(
  columns: number,
  columnSizes: Array<number | 'fr'> | undefined,
  userCellWidth: number | null,
  minColumnPx: number
): number {
  if (userCellWidth !== null) {
    return columns * userCellWidth;
  }

  if (!columnSizes || columnSizes.length === 0) {
    return columns * minColumnPx;
  }

  let sum = 0;
  for (let i = 0; i < Math.min(columns, columnSizes.length); i++) {
    const c = columnSizes[i];
    sum += typeof c === 'number' ? c : minColumnPx;
  }
  return sum;
}

/**
 * Generate CSS grid template columns string
 */
export function generateColumnTemplate(
  layoutType: string,
  columns: number,
  columnSizes: Array<number | 'fr'> | undefined,
  userCellWidth: number | null,
  minColumnPx: number
): string {
  if (userCellWidth !== null) {
    return `repeat(${columns}, ${userCellWidth}px)`;
  }

  if (layoutType === 'vertical') {
    return `minmax(${minColumnPx}px, 1fr)`;
  }

  if (columnSizes && columnSizes.length > 0) {
    return columnSizes
      .slice(0, columns)
      .map((c) => (typeof c === 'number' ? `${c}px` : `minmax(${minColumnPx}px, 1fr)`))
      .join(' ');
  }

  return `repeat(${columns}, minmax(${minColumnPx}px, 1fr))`;
}

/**
 * Infer row sizes from grid cells or use calculated height
 */
export function inferRowSizes(
  grid: GridResultModel | null,
  rows: number,
  rowSizes: Array<number | 'fr'> | undefined,
  userCellHeight: number | null,
  calculatedRowHeightPx: number
): Array<number | 'fr'> {
  if (userCellHeight !== null) {
    return Array(rows).fill(userCellHeight);
  }

  const sizes: Array<number | 'fr'> = [];
  for (let r = 0; r < rows; r++) {
    const sample = getPlotGridCellAtRow(grid, r);
    const h = (sample?.content.options as any)?.height;
    sizes.push(
      typeof h === 'number'
        ? h
        : rowSizes && typeof rowSizes[r] === 'number'
          ? (rowSizes[r] as number)
          : calculatedRowHeightPx
    );
  }
  return sizes;
}

/**
 * Convert row sizes to CSS grid template rows string
 */
export function generateRowTemplate(
  rowSizes: Array<number | 'fr'>,
  calculatedRowHeightPx: number
): string {
  return rowSizes
    .map((h) => (typeof h === 'number' ? `${h}px` : `${calculatedRowHeightPx}px`))
    .join(' ');
}

/**
 * Convert row sizes to actual pixel heights
 */
export function getActualRowHeights(
  rowSizes: Array<number | 'fr'>,
  calculatedRowHeightPx: number
): number[] {
  return rowSizes.map((h) => (typeof h === 'number' ? h : calculatedRowHeightPx));
}

function resolveFacetTrackSize(
  depthOverride: number | null | undefined,
  sharedOverride: number | null,
  fallbackSize: number,
): number {
  return depthOverride ?? sharedOverride ?? fallbackSize;
}

function getFallbackTrackSize(
  fallbackSize: number | number[],
  depthIndex: number,
): number {
  return Array.isArray(fallbackSize) ? fallbackSize[depthIndex] ?? 0 : fallbackSize;
}

export function resolveFacetTopValueHeights(
  depthCount: number,
  style: FacetTopValuesLabelStyle | undefined,
  fallbackSize: number | number[],
): number[] {
  return Array.from({ length: depthCount }, (_, depthIndex) =>
    resolveFacetTrackSize(
      style?.heightPxByDepth?.[depthIndex],
      style?.heightPx ?? null,
      getFallbackTrackSize(fallbackSize, depthIndex),
    )
  );
}

export function resolveFacetLeftValueWidths(
  depthCount: number,
  style: FacetLeftValuesLabelStyle | undefined,
  fallbackSize: number | number[],
): number[] {
  return Array.from({ length: depthCount }, (_, depthIndex) =>
    resolveFacetTrackSize(
      style?.widthPxByDepth?.[depthIndex],
      style?.widthPx ?? null,
      getFallbackTrackSize(fallbackSize, depthIndex),
    )
  );
}

export function sumTrackSizes(trackSizes: number[]): number {
  return trackSizes.reduce((sum, size) => sum + size, 0);
}

export interface PlotGridSizingStyleConfig {
  plotTemplateColumns: string;
  plotRowsSpec: string;
  totalContentWidthPx: number;
  columnSizes: Array<number | 'fr'> | undefined;
}

/**
 * Shared CSS Grid sizing for the visible plot grid and its hidden sizing mirror.
 * Keeping this centralized prevents resize measurement drift between the two.
 */
export function buildPlotGridSizingStyle(config: PlotGridSizingStyleConfig): CSSProperties {
  const hasFlexibleColumns = !config.columnSizes || config.columnSizes.some((c) => typeof c !== 'number');

  return {
    display: 'grid',
    gridTemplateColumns: config.plotTemplateColumns,
    gridTemplateRows: config.plotRowsSpec,
    minWidth: `${config.totalContentWidthPx}px`,
    width: hasFlexibleColumns ? '100%' : `${config.totalContentWidthPx}px`,
  };
}
