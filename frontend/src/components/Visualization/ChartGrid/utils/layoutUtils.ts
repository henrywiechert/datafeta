import {
  GridResultModel,
  getPlotGridCellAtCol,
  getPlotGridCellAtRow,
  usesOnlyAxislessRenderers,
} from '../../../../observable-plot-generator/gridModel';
import { MIN_GRID_ROW_PX } from '../../../../config/chartLayoutConfig';
import { YAxisLabelStyle } from '../../../../contexts/VisualizationContext/types';
import type { CSSProperties } from 'react';

const TEXT_PX_PER_CHAR = 6; // conservative estimate for 12-14px font
const MIN_Y_AXIS_GUTTER_PX = 28;
const Y_AXIS_BAND_LINE_WIDTH_EM = 12;
const X_AXIS_BAND_LINE_WIDTH_EM = 6.5;
const APPROX_AXIS_FONT_PX = 10;
const MAX_Y_BAND_TICK_WIDTH_PX = Y_AXIS_BAND_LINE_WIDTH_EM * APPROX_AXIS_FONT_PX;
const MAX_X_BAND_TICK_HEIGHT_PX = X_AXIS_BAND_LINE_WIDTH_EM * APPROX_AXIS_FONT_PX;

function formatTickValue(value: any, tickFormat?: ((value: any) => any) | undefined): string {
  if (!tickFormat) {
    return String(value ?? '');
  }

  try {
    return String(tickFormat(value) ?? '');
  } catch {
    return String(value ?? '');
  }
}

function estimateLongestTickPx(domain: any[], tickFormat?: ((value: any) => any) | undefined): number {
  return domain.reduce((max: number, value: any) => {
    const formatted = formatTickValue(value, tickFormat);
    return Math.max(max, estimateTextPx(formatted));
  }, 0);
}

/**
 * Estimate pixel width of text based on character count
 */
export function estimateTextPx(text?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length * TEXT_PX_PER_CHAR);
}

/**
 * Calculate dynamic Y-axis gutter width based on label content
 */
export function computeDynamicYAxisGutterPx(grid: GridResultModel | null, rows: number): number {
  if (usesOnlyAxislessRenderers(grid)) return 0;
  let maxWidth = MIN_Y_AXIS_GUTTER_PX;
  for (let r = 0; r < rows; r++) {
    const sample = getPlotGridCellAtRow(grid, r);
    const yOpts: any = sample?.content.options?.y || {};
    const yType = yOpts?.type;
    const yDomain = yOpts?.domain as any;
    const yTickFormat = yOpts?.tickFormat as ((value: any) => any) | undefined;
    let tickWidth = 0;
    if (yType === 'band' && Array.isArray(yDomain)) {
      // Categorical axis: cap to the same approximate width budget used by axisY lineWidth.
      const longest = Math.min(estimateLongestTickPx(yDomain, yTickFormat), MAX_Y_BAND_TICK_WIDTH_PX);
      tickWidth = longest + 10; // padding
    } else if (Array.isArray(yDomain) && yDomain.length === 2) {
      // Numeric axis: endpoints only (ticks are generated inside ObservablePlot)
      const [a, b] = yDomain;
      tickWidth = Math.max(estimateTextPx(String(a)), estimateTextPx(String(b))) + 6; // small padding
    }
    const rowWidth = Math.max(MIN_Y_AXIS_GUTTER_PX, tickWidth);
    if (rowWidth > maxWidth) maxWidth = rowWidth;
  }
  return maxWidth;
}

/**
 * Calculate dynamic X-axis gutter height based on label content
 */
export function computeDynamicXAxisGutterPx(grid: GridResultModel | null, columns: number): number {
  if (usesOnlyAxislessRenderers(grid)) return 0;
  let maxHeight = 24; // baseline
  for (let c = 0; c < columns; c++) {
    const sample = getPlotGridCellAtCol(grid, c);
    const xOpts: any = sample?.content.options?.x || {};
    const xType = xOpts?.type;
    const xDomain = xOpts?.domain as any;
    const xTickFormat = xOpts?.tickFormat as ((value: any) => any) | undefined;
    let height = 24;
    if (xType === 'band' && Array.isArray(xDomain)) {
      const visibleTickPx = Math.min(estimateLongestTickPx(xDomain, xTickFormat), MAX_X_BAND_TICK_HEIGHT_PX);
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
  if (usesOnlyAxislessRenderers(grid)) return 0;
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
    const sample = getPlotGridCellAtRow(grid, r);
    const yOpts: any = sample?.content.options?.y || {};
    const yLabel = yOpts?.label as string | undefined;

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
