// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * `table-refactor` chart type generator.
 *
 * Builds a Tableau-style table directly as a `GridResultModel` (without going
 * through the legacy `PlotResult` pipeline).
 *
 * Cell modes (selected via `tableCellMode` on the generation context):
 * - `symbol` — every (rowTuple, colTuple) renders one or more deduped symbol
 *   marks. Mixed values produce a preview stack (see `discreteGridSymbolLayout`).
 * - `text` — every cell renders stacked rows of formatted text, sourced from
 *   `labelFields` (Tableau's Label/Text shelf) and aggregated measures on
 *   `xFields` / `yFields`, in shelf order.
 * - `auto` — resolves to `text` when at least one measure or label field is
 *   present, `symbol` otherwise (matches Tableau's "Automatic" mark for
 *   all-discrete shelves).
 *
 * Both modes share the same row/column header construction. Headers come from
 * the discrete dimensions on the Y/X axes, in declaration order.
 *
 * Pagination (PR 8): when `tablePageSize` is supplied via the generation
 * context, the generator pages over the *distinct row-tuples* (i.e. the rows
 * of the rendered table, not over data rows). The current page is given by
 * `tablePage` (0-based). The full data set is still buffered locally in this
 * frontend-side implementation; a future PR can swap the data fetch for true
 * server-side LIMIT/OFFSET. The page metadata is exposed via
 * `GridResultModel.pagination` so the pager UI can drive itself off of it.
 */

import { Field, TableCellMode } from '../../types';
import {
  GridCellModel,
  GridHeaderAxis,
  GridHeaders,
  GridLayoutModel,
  GridResultModel,
  GridTrackSize,
  MarkGridCellContent,
  MarkSymbolSpec,
  TextGridCellContent,
  TextGridCellRow,
} from '../gridModel';
import { ChartGenerationContext } from '../types';
import { buildFacetSpace } from '../faceting/facetSpace';
import { getFieldColumnName } from '../helpers/fields';
import { getFieldDisplayName, isMeasure } from '../../utils/fieldUtils';
import { DEFAULT_CHART_COLOR, MIN_NON_PLOT_GRID_ROW_PX } from '../../config/chartLayoutConfig';
import {
  deriveShapeScaleInfo,
  getSymbolForValue,
  isManualShapeOption,
  MANUAL_NO_SHAPE,
  ShapeScaleInfo,
} from '../utils/shapeUtils';
import { deriveColorScaleInfo, ColorScaleInfo, resolveColorForRow, resolveContextColorChannel } from '../utils/colorSchemeUtils';
import { createSizeScale, SizeScale } from '../utils/sizeUtils';
import { formatTooltipValue } from '../utils/tooltipUtils';

/** Default symbol used when no shape encoding resolves to a specific shape. */
const DEFAULT_SYMBOL = 'circle';

/**
 * Default mark area for table-refactor symbol cells when no size encoding is
 * available (no `sizeField`, no `manualSize`).
 * `MarkCell` interprets `size` as Plot-style symbol area (π · r²).
 * The chosen value renders ~16 viewBox units across (a roughly 16% wide
 * symbol inside a 100×100 cell viewBox).
 */
const DEFAULT_MARK_AREA = 200;

/**
 * Default symbol radius (in pixels) when the manual-size slider is not set.
 * Picked so that `π · DEFAULT_SYMBOL_RADIUS²` ≈ `DEFAULT_MARK_AREA`, i.e. the
 * "no size encoding" visual matches the previous hard-coded default.
 */
const DEFAULT_SYMBOL_RADIUS = 8;

/**
 * Convert a notional radius (the unit the size shelf works in — same as the
 * scatter plot's `r` value) into Plot-style symbol area expected by
 * `MarkSymbolSpec.size`.
 */
function radiusToSymbolArea(radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return DEFAULT_MARK_AREA;
  return Math.PI * radius * radius;
}

/**
 * Resolve `auto` to the concrete cell mode emitted by `generateTableGrid`.
 *
 * Rule (matches Tableau's "Automatic" mark for all-discrete shelves):
 * - `text` if any measure is on X/Y or any label field is configured — measures
 *   and label fields naturally feed per-cell text content.
 * - `symbol` otherwise (presence dot, optionally encoded by color/shape/size).
 *
 * Explicit selections (`text`, `symbol`) bypass the auto rule.
 */
export function resolveTableCellMode(context: ChartGenerationContext, mode: TableCellMode): 'text' | 'symbol' {
  if (mode === 'text') return 'text';
  if (mode === 'symbol') return 'symbol';
  const hasMeasure = [...(context.xFields ?? []), ...(context.yFields ?? [])].some(isMeasure);
  const hasLabelField = (context.labelFields ?? []).length > 0;
  return hasMeasure || hasLabelField ? 'text' : 'symbol';
}

interface SymbolFingerprint {
  symbol: string;
  color: string;
  /** Per-row size in notional radius units (same as scatter's `r`). */
  radius: number;
}

function fingerprint(spec: SymbolFingerprint): string {
  return `${spec.symbol}\x1f${spec.color}`;
}

function discreteHeaderFields(fields: Field[]): Field[] {
  return fields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
}

function buildHeaderAxis(
  fields: Field[],
  tuples: any[][],
  context: ChartGenerationContext,
): GridHeaderAxis | undefined {
  if (fields.length === 0 || tuples.length === 0) return undefined;

  const levels = fields.map((field, levelIdx) => {
    const seen = new Set<any>();
    const orderedValues: any[] = [];
    for (const tuple of tuples) {
      const value = tuple[levelIdx];
      const key = value instanceof Date ? value.getTime() : value;
      if (!seen.has(key)) {
        seen.add(key);
        orderedValues.push(value);
      }
    }
    return {
      fieldLabel: getFieldDisplayName(field, context.fieldAliasLookup),
      values: orderedValues,
    };
  });

  return {
    levels,
    baseSpan: 1,
    orderedValueTuples: tuples.map((t) => [...t]),
  };
}

function buildSymbolForRow(
  row: any,
  context: ChartGenerationContext,
  shapeScale: ShapeScaleInfo | null,
  colorScale: ColorScaleInfo | null,
  sizeScale: SizeScale,
): SymbolFingerprint {
  // Symbol resolution
  let symbol: string = DEFAULT_SYMBOL;
  if (context.shapeField && shapeScale) {
    const shapeColumn = getFieldColumnName(context.shapeField);
    symbol = getSymbolForValue(row?.[shapeColumn], shapeScale);
  } else if (context.manualShape && isManualShapeOption(context.manualShape) && context.manualShape !== MANUAL_NO_SHAPE) {
    symbol = context.manualShape;
  }

  // Color resolution. Delegates to the shared `resolveColorForRow` helper so
  // categorical and continuous (e.g. measure on color shelf) scales behave
  // identically to other chart types — symbol cells were previously only
  // honouring categorical scales.
  const fallbackColor = context.manualColor || DEFAULT_CHART_COLOR;
  const color = resolveColorForRow(row, colorScale, context.colorField, fallbackColor);

  // Size resolution. `sizeScale.getSizeForValue` returns a notional radius
  // (consistent with scatter / `r`). When no `sizeField` is set the scale
  // returns the manual radius for every value.
  let radius = DEFAULT_SYMBOL_RADIUS;
  if (context.sizeField) {
    const sizeColumn = getFieldColumnName(context.sizeField);
    const raw = sizeScale.getSizeForValue(row?.[sizeColumn]);
    if (Number.isFinite(raw) && raw > 0) radius = raw;
  } else if (Number.isFinite(context.manualSize as number) && (context.manualSize as number) > 0) {
    radius = context.manualSize as number;
  }

  return { symbol, color, radius };
}

/**
 * De-duplicate symbol specs by (symbol, color) fingerprint. When multiple rows
 * in the same cell share a fingerprint but differ in encoded size, take the
 * largest — visually clearer than averaging and keeps the dominant value
 * visible. The dedup-by-fingerprint matches PR 6 / 7 semantics so that color
 * and shape variation continues to drive separate mark stacks.
 */
function aggregateSymbols(specs: SymbolFingerprint[]): MarkSymbolSpec[] {
  const seen = new Map<string, MarkSymbolSpec & { _radius: number }>();
  for (const spec of specs) {
    const key = fingerprint(spec);
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, {
        symbol: spec.symbol,
        color: spec.color,
        size: radiusToSymbolArea(spec.radius),
        _radius: spec.radius,
      });
    } else if (spec.radius > prev._radius) {
      prev.size = radiusToSymbolArea(spec.radius);
      prev._radius = spec.radius;
    }
  }
  return Array.from(seen.values()).map(({ _radius, ...rest }) => rest);
}

function buildEmptyCell(rowIdx: number, colIdx: number): GridCellModel {
  return {
    id: `table-cell-${rowIdx}-${colIdx}`,
    position: { row: rowIdx, col: colIdx },
    content: { kind: 'empty' },
  };
}

function buildMarkCell(rowIdx: number, colIdx: number, symbols: MarkSymbolSpec[]): GridCellModel {
  const content: MarkGridCellContent = {
    kind: 'mark',
    symbols,
  };
  return {
    id: `table-cell-${rowIdx}-${colIdx}`,
    position: { row: rowIdx, col: colIdx },
    content,
  };
}

function buildTextCell(rowIdx: number, colIdx: number, rows: TextGridCellRow[]): GridCellModel {
  const content: TextGridCellContent = {
    kind: 'text',
    rows,
  };
  return {
    id: `table-cell-${rowIdx}-${colIdx}`,
    position: { row: rowIdx, col: colIdx },
    content,
  };
}

/**
 * Discrete dimensions and measures contributing rows to a `kind: 'text'` cell.
 * Computed once per generation and reused for every cell so the shelf order is
 * preserved.
 */
interface TextRowSource {
  field: Field;
  source: 'label' | 'measure';
  /** Result-set column carrying the per-row value. */
  column: string;
  /** Display label (alias-aware). */
  label: string;
}

/**
 * Display label for a measure field in a text cell.
 *
 * Uses the user-provided alias when set (from `fieldAliasLookup` or
 * `displayAlias`); otherwise falls back to the aggregation-prefixed form
 * (e.g. `SUM(sales)`) so that multiple measures in the same cell remain
 * distinguishable and align with the backend's result-column names.
 */
function buildMeasureLabel(field: Field, aliasLookup?: Record<string, string>): string {
  const explicitAlias = aliasLookup?.[field.columnName] ?? field.displayAlias;
  if (explicitAlias) return explicitAlias;
  if (field.aggregation) {
    return `${field.aggregation.toUpperCase()}(${field.columnName})`;
  }
  return getFieldDisplayName(field, aliasLookup);
}

/**
 * Collect the ordered list of fields contributing per-cell text rows.
 * Sources, in shelf order:
 *   1. `labelFields` (Tableau "Label" / "Text" shelf)
 *   2. measures from `xFields` and `yFields` (in declaration order)
 * Duplicates by result-column are de-duped so a measure that also appears as a
 * label only renders once.
 */
function collectTextRowSources(context: ChartGenerationContext): TextRowSource[] {
  const seen = new Set<string>();
  const result: TextRowSource[] = [];

  for (const field of context.labelFields ?? []) {
    const column = getFieldColumnName(field);
    if (seen.has(column)) continue;
    seen.add(column);
    result.push({
      field,
      source: 'label',
      column,
      label: getFieldDisplayName(field, context.fieldAliasLookup),
    });
  }

  for (const field of [...(context.xFields ?? []), ...(context.yFields ?? [])]) {
    if (!isMeasure(field)) continue;
    const column = getFieldColumnName(field);
    if (seen.has(column)) continue;
    seen.add(column);
    result.push({
      field,
      source: 'measure',
      column,
      label: buildMeasureLabel(field, context.fieldAliasLookup),
    });
  }

  return result;
}

/**
 * Build the list of text rows for a single cell from one (already aggregated)
 * data row. Skips sources whose value is missing — the backend may omit them
 * when the cell is empty for that source.
 */
function buildTextRowsFromRow(row: any, sources: TextRowSource[]): TextGridCellRow[] {
  const rows: TextGridCellRow[] = [];
  for (const src of sources) {
    const raw = row?.[src.column];
    if (raw === undefined || raw === null) continue;
    rows.push({
      source: src.source,
      label: src.label,
      value: formatTooltipValue(raw),
    });
  }
  return rows;
}

function buildLayout(rows: number, cols: number): GridLayoutModel {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);
  // Compact rows (Tableau-style table density). Columns flex to fill.
  const columnSizes: GridTrackSize[] = Array.from({ length: safeCols }, () => 'fr');
  const rowSizes: GridTrackSize[] = Array.from({ length: safeRows }, () => MIN_NON_PLOT_GRID_ROW_PX);
  return {
    type: 'grid',
    columns: safeCols,
    rows: safeRows,
    columnSizes,
    rowSizes,
  };
}

function tupleKeyFromValues(values: any[]): string {
  return values
    .map((v) => (v instanceof Date ? `D:${v.getTime()}` : String(v)))
    .join('\x1e');
}

function bucketKey(rowTupleKey: string, colTupleKey: string): string {
  return `${rowTupleKey}\x1f${colTupleKey}`;
}

/**
 * Bucket data rows by (rowTuple, colTuple). Rows whose tuple values are
 * `undefined` (missing column) are skipped — they cannot map to a cell.
 */
function bucketRowsByCellTuple<T>(
  data: any[],
  yHeaderFields: Field[],
  xHeaderFields: Field[],
  project: (row: any) => T,
): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const row of data) {
    const rowTupleParts: string[] = [];
    let rowSkip = false;
    for (let i = 0; i < yHeaderFields.length; i++) {
      const col = getFieldColumnName(yHeaderFields[i]);
      const v = row?.[col];
      if (v === undefined) {
        rowSkip = true;
        break;
      }
      rowTupleParts.push(v instanceof Date ? `D:${v.getTime()}` : String(v));
    }
    if (rowSkip) continue;

    const colTupleParts: string[] = [];
    let colSkip = false;
    for (let j = 0; j < xHeaderFields.length; j++) {
      const col = getFieldColumnName(xHeaderFields[j]);
      const v = row?.[col];
      if (v === undefined) {
        colSkip = true;
        break;
      }
      colTupleParts.push(v instanceof Date ? `D:${v.getTime()}` : String(v));
    }
    if (colSkip) continue;

    const key = bucketKey(rowTupleParts.join('\x1e'), colTupleParts.join('\x1e'));
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(project(row));
  }
  return buckets;
}

interface FacetSpaceContext {
  rowTuples: any[][];
  colTuples: any[][];
  xHeaderFields: Field[];
  yHeaderFields: Field[];
}

function buildFacetSpaceContext(context: ChartGenerationContext, data: any[]): FacetSpaceContext {
  const xHeaderFields = discreteHeaderFields(context.xFields);
  const yHeaderFields = discreteHeaderFields(context.yFields);
  const facetSpace = buildFacetSpace(data, yHeaderFields, xHeaderFields);
  return {
    xHeaderFields,
    yHeaderFields,
    rowTuples: facetSpace.safeRowCombos,
    colTuples: facetSpace.safeColCombos,
  };
}

function buildHeadersForFacetSpace(
  facetCtx: FacetSpaceContext,
  context: ChartGenerationContext,
): GridHeaders | undefined {
  const rowsAxis = buildHeaderAxis(
    facetCtx.yHeaderFields,
    facetCtx.rowTuples.filter((t: any[]) => t.length > 0),
    context,
  );
  const colsAxis = buildHeaderAxis(
    facetCtx.xHeaderFields,
    facetCtx.colTuples.filter((t: any[]) => t.length > 0),
    context,
  );
  if (!rowsAxis && !colsAxis) return undefined;
  return { rows: rowsAxis, cols: colsAxis };
}

/**
 * Build the cell list for the `symbol` cell mode: every (rowTuple, colTuple)
 * resolves to either a `mark` cell with one or more deduped symbol specs, or
 * an `empty` cell when no rows match.
 */
function buildSymbolModeCells(
  facetCtx: FacetSpaceContext,
  data: any[],
  context: ChartGenerationContext,
): GridCellModel[] {
  const colorScale = context.colorField
    ? deriveColorScaleInfo(data, resolveContextColorChannel(context))
    : null;
  const shapeScale = context.shapeField && context.shapeField.flavour === 'discrete'
    ? deriveShapeScaleInfo(data, context.shapeField)
    : null;
  // Build a size scale across the full dataset so that per-cell symbol radii
  // are comparable across the table (the same value always renders the same
  // size, regardless of which cell it lands in).
  const manualRadius =
    Number.isFinite(context.manualSize as number) && (context.manualSize as number) > 0
      ? (context.manualSize as number)
      : DEFAULT_SYMBOL_RADIUS;
  const sizeScale = createSizeScale(
    data,
    context.sizeField ?? null,
    context.sizeRange ?? [manualRadius, manualRadius],
    manualRadius,
  );

  const buckets = bucketRowsByCellTuple<SymbolFingerprint>(
    data,
    facetCtx.yHeaderFields,
    facetCtx.xHeaderFields,
    (row) => buildSymbolForRow(row, context, shapeScale, colorScale, sizeScale),
  );

  const cells: GridCellModel[] = [];
  for (let r = 0; r < facetCtx.rowTuples.length; r++) {
    const rowTupleKey = tupleKeyFromValues(facetCtx.rowTuples[r]);
    for (let c = 0; c < facetCtx.colTuples.length; c++) {
      const colTupleKey = tupleKeyFromValues(facetCtx.colTuples[c]);
      const symbols = aggregateSymbols(buckets.get(bucketKey(rowTupleKey, colTupleKey)) ?? []);
      cells.push(symbols.length > 0 ? buildMarkCell(r, c, symbols) : buildEmptyCell(r, c));
    }
  }
  return cells;
}

/**
 * Build the cell list for the `text` cell mode: every (rowTuple, colTuple)
 * resolves to a `text` cell containing one row per label/measure source. The
 * underlying query is already aggregated by the discrete X/Y dimensions, so
 * each bucket is expected to contain a single representative row; if the
 * bucket is empty (cell has no data), the cell is rendered as `empty`.
 */
function buildTextModeCells(
  facetCtx: FacetSpaceContext,
  data: any[],
  context: ChartGenerationContext,
): GridCellModel[] {
  const sources = collectTextRowSources(context);

  const buckets = bucketRowsByCellTuple<any>(
    data,
    facetCtx.yHeaderFields,
    facetCtx.xHeaderFields,
    (row) => row,
  );

  const cells: GridCellModel[] = [];
  for (let r = 0; r < facetCtx.rowTuples.length; r++) {
    const rowTupleKey = tupleKeyFromValues(facetCtx.rowTuples[r]);
    for (let c = 0; c < facetCtx.colTuples.length; c++) {
      const colTupleKey = tupleKeyFromValues(facetCtx.colTuples[c]);
      const bucket = buckets.get(bucketKey(rowTupleKey, colTupleKey));
      if (!bucket || bucket.length === 0) {
        cells.push(buildEmptyCell(r, c));
        continue;
      }
      // Aggregated query produces one row per (rowTuple, colTuple); take it.
      // For un-aggregated label-only data we still render the first row's
      // values (good enough for PR 7; PR 8 introduces explicit aggregation).
      const textRows = buildTextRowsFromRow(bucket[0], sources);
      cells.push(textRows.length > 0 ? buildTextCell(r, c, textRows) : buildEmptyCell(r, c));
    }
  }
  return cells;
}

/**
 * Sanitize a raw page-size value. Non-positive / non-finite inputs disable
 * pagination (returns 0).
 */
function sanitizePageSize(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}

/**
 * Clamp a page index into [0, lastValidPage]. Falls back to 0 when pagination
 * is disabled or the input is invalid.
 */
function sanitizePage(raw: number | undefined, total: number, pageSize: number): number {
  if (pageSize <= 0) return 0;
  const idx = Number.isFinite(raw) && (raw as number) >= 0 ? Math.floor(raw as number) : 0;
  const lastValid = Math.max(0, Math.ceil(total / pageSize) - 1);
  return Math.min(idx, lastValid);
}

/**
 * Generate a table grid as a `GridResultModel`.
 *
 * Dispatches between `text` and `symbol` cell modes via `resolveTableCellMode`.
 * Both modes share the same row/column header construction and bucketing
 * skeleton; only the per-cell content differs.
 *
 * When `tablePageSize > 0` is provided in the context, the generator slices
 * the distinct row-tuples to the requested page window. The full data set is
 * still bucketed (cells outside the page window are simply not emitted). The
 * total row-tuple count and effective page index are surfaced via the
 * `pagination` field on the returned grid for the UI pager.
 */
export function generateTableGrid(context: ChartGenerationContext): GridResultModel {
  const data = Array.isArray(context.queryResult?.rows) ? context.queryResult.rows : [];
  const facetCtx = buildFacetSpaceContext(context, data);
  const mode = resolveTableCellMode(context, context.tableCellMode ?? 'auto');

  const totalRowTuples = facetCtx.rowTuples.length;
  const pageSize = sanitizePageSize(context.tablePageSize);
  const page = sanitizePage(context.tablePage, totalRowTuples, pageSize);

  const pagedFacetCtx: FacetSpaceContext = pageSize > 0
    ? {
        ...facetCtx,
        rowTuples: facetCtx.rowTuples.slice(page * pageSize, (page + 1) * pageSize),
      }
    : facetCtx;

  const cells = mode === 'text'
    ? buildTextModeCells(pagedFacetCtx, data, context)
    : buildSymbolModeCells(pagedFacetCtx, data, context);

  return {
    cells,
    layout: buildLayout(pagedFacetCtx.rowTuples.length, pagedFacetCtx.colTuples.length),
    headers: buildHeadersForFacetSpace(pagedFacetCtx, context),
    pagination: pageSize > 0
      ? { totalRowTuples, pageSize, page }
      : undefined,
  };
}
