import * as Plot from '@observablehq/plot';
import { Field } from '../../../types';
import { FacetBackgroundInfo, PiePlotSpec } from '../../../observable-plot-generator/types';

/**
 * Generic grid model consumed by ChartGrid and friends.
 *
 * In PR 1 this is populated by `plotResultAdapter` from the legacy `PlotResult`.
 * Later PRs will add cell kinds (`text`, `mark`, `empty`, `pie`) and eventually
 * make the generator emit `GridResultModel` directly (PR 5).
 */

export type GridTrackSize = number | 'fr';

export interface GridCellPosition {
  row: number;
  col: number;
}

export interface GridLayoutModel {
  type: 'grid' | 'vertical' | 'horizontal';
  columns: number;
  rows: number;
  columnSizes: GridTrackSize[];
  rowSizes: GridTrackSize[];
  minColumnSizes?: number[];
  minRowSizes?: number[];
}

export interface GridHeaderLevel {
  fieldLabel: string;
  values: any[];
}

export interface GridHeaderAxis {
  levels: GridHeaderLevel[];
  /** Span (in cell tracks) covered by a single base facet group at the innermost level. */
  baseSpan: number;
  /**
   * Reserved for PR 2: ordered tuples of header values for hierarchical span
   * computation. Optional in PR 1; FacetLabels will fall back to product spans
   * when absent.
   */
  orderedValueTuples?: any[][];
}

export interface GridHeaders {
  rows?: GridHeaderAxis;
  cols?: GridHeaderAxis;
}

export interface PlotGridCellContent {
  kind: 'plot';
  options: Plot.PlotOptions;
  facetBackground?: FacetBackgroundInfo;
  /**
   * Temporary passthrough so pie cells continue to dispatch to PieSvgRenderer.
   * PR 4 will replace this with a dedicated `kind: 'pie'` cell content.
   */
  renderer?: 'observable-plot' | 'pie-svg';
  pieSpec?: PiePlotSpec;
}

/**
 * Stacked rows of formatted text inside a single table-style cell. Each row
 * is sourced from either a label field or an aggregated measure, formatted
 * via the same helpers used elsewhere in the app.
 */
export interface TextGridCellRow {
  /** Origin of the value: a discrete label field or an aggregated measure. */
  source: 'label' | 'measure';
  /** Display label for the row (e.g. field display name). */
  label: string;
  /** Pre-formatted display value. */
  value: string;
}

export interface TextGridCellContent {
  kind: 'text';
  rows: TextGridCellRow[];
  facetBackground?: FacetBackgroundInfo;
}

/**
 * Symbol marks rendered directly inside a cell (Tableau "Marks" card style).
 * Mixed values are rendered as a small preview stack of symbols.
 */
export interface MarkSymbolSpec {
  /** Observable Plot symbol name (e.g. 'circle', 'square'). */
  symbol: string;
  /** Fill color (hex/css). */
  color: string;
  /** Symbol size in pixel area (matches `Plot.dot` size). */
  size: number;
  /** Optional opacity. */
  opacity?: number;
}

export interface MarkGridCellContent {
  kind: 'mark';
  /** One or more symbols to render. >1 marks the cell as a mixed/preview stack. */
  symbols: MarkSymbolSpec[];
  facetBackground?: FacetBackgroundInfo;
}

export interface EmptyGridCellContent {
  kind: 'empty';
  facetBackground?: FacetBackgroundInfo;
}

export type GridCellContent =
  | PlotGridCellContent
  | TextGridCellContent
  | MarkGridCellContent
  | EmptyGridCellContent;

export interface GridCellMetadata {
  title?: string;
  xField?: Field;
  yField?: Field;
}

export interface GridCellModel {
  id: string;
  position: GridCellPosition;
  content: GridCellContent;
  metadata?: GridCellMetadata;
}

export interface PlotGridCellModel extends GridCellModel {
  content: PlotGridCellContent;
}

export interface TextGridCellModel extends GridCellModel {
  content: TextGridCellContent;
}

export interface MarkGridCellModel extends GridCellModel {
  content: MarkGridCellContent;
}

export interface EmptyGridCellModel extends GridCellModel {
  content: EmptyGridCellContent;
}

export interface GridResultModel {
  cells: GridCellModel[];
  layout: GridLayoutModel;
  headers?: GridHeaders;
  /**
   * Carried through from the generator for downstream consumers (e.g. debug view).
   * Not used by ChartGrid itself.
   */
  sharedDomains?: { byMeasure?: Record<string, [number, number]> };
}

export function isPlotGridCell(cell: GridCellModel): cell is PlotGridCellModel {
  return cell.content.kind === 'plot';
}

export function getPlotGridCells(grid: GridResultModel | null): PlotGridCellModel[] {
  return (grid?.cells || []).filter(isPlotGridCell);
}

export function hasPlotGridCells(grid: GridResultModel | null): boolean {
  return getPlotGridCells(grid).length > 0;
}

export function getPlotGridCellAtRow(grid: GridResultModel | null, row: number): PlotGridCellModel | undefined {
  return getPlotGridCells(grid).find((cell) => cell.position.row === row);
}

export function getPlotGridCellAtCol(grid: GridResultModel | null, col: number): PlotGridCellModel | undefined {
  return getPlotGridCells(grid).find((cell) => cell.position.col === col);
}

export function getPlotGridCellById(grid: GridResultModel | null, id: string | null): PlotGridCellModel | undefined {
  if (!id) return undefined;
  return getPlotGridCells(grid).find((cell) => cell.id === id);
}

export function hasColumnHeaders(grid: GridResultModel | null): boolean {
  return (grid?.headers?.cols?.levels.length ?? 0) > 0;
}

export function hasRowHeaders(grid: GridResultModel | null): boolean {
  return (grid?.headers?.rows?.levels.length ?? 0) > 0;
}

/**
 * Truthy when the grid carries any facet header metadata (rows or cols).
 * Mirrors the legacy `spec.facetLabels` truthiness check used by layout templates.
 */
export function hasFacetHeaders(grid: GridResultModel | null): boolean {
  return Boolean(grid?.headers);
}

/**
 * True when every plot cell uses an axis-less renderer (e.g. pie) and no
 * external X/Y axis gutters should be drawn.
 */
export function usesOnlyAxislessRenderers(grid: GridResultModel | null): boolean {
  const plotCells = getPlotGridCells(grid);
  if (plotCells.length === 0) return false;
  return plotCells.every((cell) => {
    const content = cell.content;
    return (
      content.renderer === 'pie-svg' ||
      (content.options as any)?.__hideExternalAxes === true
    );
  });
}
