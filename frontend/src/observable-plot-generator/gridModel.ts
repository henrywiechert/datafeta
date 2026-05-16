// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { CustomTooltipConfig, Field } from '../types';
import { FacetBackgroundInfo, PiePlotSpec } from './types';

/**
 * Canonical grid model emitted by the chart generator and consumed by ChartGrid.
 *
 * The generator's public entry point (`generatePlot`) returns a `GridResultModel`.
 * Internally the chart pipeline still threads a legacy `PlotResult` between
 * faceting and chart-type helpers; the boundary translation lives in
 * `buildGridFromPlotResult` and is invoked once at the public boundary.
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
   * Ordered tuples of header values used by hierarchical header rendering to
   * compute accurate spans. Optional; FacetLabels falls back to product spans
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
}

/**
 * Pie cell rendered by `PieSvgRenderer`. Carries the resolved `PiePlotSpec`
 * and an optional custom tooltip configuration. Pie cells render without
 * external axes (see `usesOnlyAxislessRenderers`).
 */
export interface PieGridCellContent {
  kind: 'pie';
  pieSpec: PiePlotSpec;
  tooltipConfig?: CustomTooltipConfig;
  facetBackground?: FacetBackgroundInfo;
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
  | PieGridCellContent
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

export interface PieGridCellModel extends GridCellModel {
  content: PieGridCellContent;
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
  /**
   * Pagination metadata for the 'table-refactor' chart type.
   * Populated by `generateTableGrid` when a non-zero `tablePageSize` is supplied
   * via `ChartGenerationContext`. Consumers (e.g. ChartArea pager UI) read this
   * to drive a pager component. Absent for non-paged chart kinds.
   */
  pagination?: {
    /** Total number of distinct row-tuples in the underlying data set. */
    totalRowTuples: number;
    /** Number of row-tuples requested per page (sanitized). */
    pageSize: number;
    /** 0-based page index that produced these cells (sanitized). */
    page: number;
  };
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
 * True when every cell renders without external X/Y axes (pie cells, or plot
 * cells flagged via the `__hideExternalAxes` option). Empty/text/mark cells
 * are also axis-less. Returns false for an empty grid.
 */
export function usesOnlyAxislessRenderers(grid: GridResultModel | null): boolean {
  const cells = grid?.cells ?? [];
  if (cells.length === 0) return false;
  return cells.every((cell) => {
    switch (cell.content.kind) {
      case 'pie':
      case 'text':
      case 'mark':
      case 'empty':
        return true;
      case 'plot':
        return (cell.content.options as any)?.__hideExternalAxes === true;
      default:
        return false;
    }
  });
}
