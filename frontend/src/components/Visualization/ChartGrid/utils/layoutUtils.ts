import { PlotResult } from '../../../../observable-plot-generator/types';
import { MIN_GRID_COLUMN_PX, MIN_GRID_ROW_PX } from '../../../../config/chartLayoutConfig';

const TEXT_PX_PER_CHAR = 6; // conservative estimate for 12-14px font
const MIN_Y_AXIS_GUTTER_PX = 28;

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
export function computeDynamicYAxisGutterPx(spec: PlotResult, rows: number): number {
  let maxWidth = MIN_Y_AXIS_GUTTER_PX;
  const plots = spec.plots || [];
  for (let r = 0; r < rows; r++) {
    const sample = plots.find((p) => p.position?.row === r);
    const yOpts: any = (sample as any)?.options?.y || {};
    const yType = yOpts?.type;
    const yDomain = yOpts?.domain as any;
    let tickWidth = 0;
    if (yType === 'band' && Array.isArray(yDomain)) {
      // Categorical axis: estimate by longest label
      const longest = yDomain.reduce((m: number, v: any) => Math.max(m, estimateTextPx(String(v))), 0);
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
export function computeDynamicXAxisGutterPx(spec: PlotResult, columns: number): number {
  let maxHeight = 24; // baseline
  const plots = spec.plots || [];
  for (let c = 0; c < columns; c++) {
    const sample = plots.find((p) => p.position?.col === c);
    const xOpts: any = (sample as any)?.options?.x || {};
    const xType = xOpts?.type;
    const xDomain = xOpts?.domain as any;
    let height = 24;
    if (xType === 'band' && Array.isArray(xDomain)) {
      const longestPx = xDomain.reduce((m: number, v: any) => Math.max(m, estimateTextPx(String(v))), 0);
      // Approx vertical component of rotated labels at 45deg
      const rotatedVertical = Math.ceil(longestPx * Math.SQRT1_2) + 8; // 0.707 + padding
      height = Math.max(30, 14 + rotatedVertical); // base tick + labels
    } else {
      // numeric or time, modest ticks
      height = 30;
    }
    if (height > maxHeight) maxHeight = height;
  }
  return maxHeight;
}

/**
 * Calculate dynamic Y-label column width based on label length and available row height
 */
export function computeDynamicYLabelColPx(spec: PlotResult, rowHeightPx: number): number {
  const rows = spec.layout?.rows || 1;
  const plots = spec.plots || [];
  let maxLabelWidth = 16; // Default width

  const FONT_SIZE_PX = 10;
  const LINE_HEIGHT = 1.2;
  const CHAR_HEIGHT_PX = FONT_SIZE_PX; // Approximate height of a character

  for (let r = 0; r < rows; r++) {
    const sample = plots.find((p) => p.position?.row === r);
    const yOpts: any = (sample as any)?.options?.y || {};
    const yLabel = yOpts?.label as string | undefined;

    if (yLabel && rowHeightPx > 0) {
      const charsPerColumn = Math.max(1, Math.floor(rowHeightPx / CHAR_HEIGHT_PX));
      const requiredColumns = Math.ceil(yLabel.length / charsPerColumn);
      const requiredWidth = requiredColumns * FONT_SIZE_PX * LINE_HEIGHT;
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
 * Infer row sizes from spec or use calculated height
 */
export function inferRowSizes(
  spec: PlotResult,
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
    const sample = spec.plots?.find((p) => p.position?.row === r);
    const h = (sample as any)?.options?.height;
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
