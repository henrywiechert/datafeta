// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * `table-refactor` chart type generator.
 *
 * Builds a Tableau-style table directly as a `GridResultModel` (without going
 * through the legacy `PlotResult` pipeline).
 *
 * Cell content (symbols and text coexist in the same cell):
 * - Symbols — deduped symbol marks (Tableau "Marks" card). Mixed values within
 *   a cell produce a preview stack (see `discreteGridSymbolLayout`). Symbols are
 *   emitted when a shape/size/color encoding is configured, or — to preserve the
 *   bare-table "presence dot" — when no label fields are present.
 * - Text — stacked rows of formatted text, sourced from `labelFields` (Tableau's
 *   Label/Text shelf), in shelf order.
 * A populated (rowTuple, colTuple) cell may therefore carry symbols, text, or
 * both; a cell with neither is emitted as an empty cell.
 *
 * Headers come from the discrete dimensions on the Y/X axes, in declaration
 * order.
 *
 * Pagination (PR 8): when `tablePageSize` is supplied via the generation
 * context, the generator pages over the *distinct row-tuples* (i.e. the rows
 * of the rendered table, not over data rows). The current page is given by
 * `tablePage` (0-based). The full data set is still buffered locally in this
 * frontend-side implementation; a future PR can swap the data fetch for true
 * server-side LIMIT/OFFSET. The page metadata is exposed via
 * `GridResultModel.pagination` so the pager UI can drive itself off of it.
 */

import { ColorChannel, Field } from '../../types';
import {
  GridCellModel,
  GridHeaderAxis,
  GridHeaders,
  GridLayoutModel,
  GridResultModel,
  GridTrackSize,
  MarkSymbolSpec,
  MeasureBand,
  MeasureBands,
  TableGridCellContent,
  TextGridCellRow,
} from '../gridModel';
import { buildFacetSpace } from '../faceting/facetSpace';
import { getFieldColumnName } from '../helpers/fields';
import { getFieldDisplayName } from '../../utils/fieldUtils';
import {
  DEFAULT_CHART_COLOR,
  MIN_NON_PLOT_GRID_ROW_PX,
  TABLE_MIN_CELL_HEIGHT_PX,
  TABLE_MIN_CELL_WIDTH_PX,
} from '../../config/chartLayoutConfig';
import {
  deriveShapeScaleInfo,
  getSymbolForValue,
  isManualShapeOption,
  MANUAL_NO_SHAPE,
  ShapeScaleInfo,
} from '../utils/shapeUtils';
import { deriveColorScaleInfo, ColorScaleInfo, resolveColorForRow } from '../utils/colorSchemeUtils';
import { createSizeScale, SizeScale } from '../utils/sizeUtils';
import { formatTooltipValue } from '../utils/tooltipUtils';

export interface TableGridInput {
  xFields: Field[];
  yFields: Field[];
  rows: any[];
  color?: ColorChannel;
  sizeField?: Field;
  sizeRange?: [number, number];
  manualSize?: number;
  shapeField?: Field;
  manualShape?: string;
  labelFields?: Field[];
  /** Font size (px) for cell text, driven by the Labels font-size slider. */
  labelFontSize?: number;
  fieldAliasLookup?: Record<string, string>;
  tablePage?: number;
  tablePageSize?: number;
}

/** Default symbol used when no shape encoding resolves to a specific shape. */
const DEFAULT_SYMBOL = 'circle';

const DEFAULT_COLOR_CHANNEL: ColorChannel = {
  field: null,
  scheme: '',
  bias: 0,
  reversed: false,
  manual: '',
};

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
 * Whether populated cells should carry a symbol mark.
 *
 * Symbols render when there is an explicit shape/size/color encoding. As a
 * fallback, a bare table (no label fields, no explicit encoding) still renders
 * a presence dot — preserving the historical symbol-table look. A label-only
 * table renders text alone (no stray presence dot).
 *
 * `manualSize`/`manualShape` are intentionally *not* treated as explicit
 * encodings: they are always populated with chart-type defaults upstream, so
 * they carry no signal about user intent.
 */
export function shouldRenderSymbols(
  input: Pick<TableGridInput, 'labelFields' | 'shapeField' | 'sizeField' | 'color'>,
): boolean {
  const hasEncoding = Boolean(input.shapeField || input.sizeField || input.color?.field);
  if (hasEncoding) return true;
  return (input.labelFields ?? []).length === 0;
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
  fieldAliasLookup?: Record<string, string>,
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
      fieldLabel: getFieldDisplayName(field, fieldAliasLookup),
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
  input: TableGridInput,
  colorChannel: ColorChannel,
  shapeScale: ShapeScaleInfo | null,
  colorScale: ColorScaleInfo | null,
  sizeScale: SizeScale,
): SymbolFingerprint {
  // Symbol resolution
  let symbol: string = DEFAULT_SYMBOL;
  if (input.shapeField && shapeScale) {
    const shapeColumn = getFieldColumnName(input.shapeField);
    symbol = getSymbolForValue(row?.[shapeColumn], shapeScale);
  } else if (input.manualShape && isManualShapeOption(input.manualShape) && input.manualShape !== MANUAL_NO_SHAPE) {
    symbol = input.manualShape;
  }

  // Color resolution. Delegates to the shared `resolveColorForRow` helper so
  // categorical and continuous (e.g. measure on color shelf) scales behave
  // identically to other chart types — symbol cells were previously only
  // honouring categorical scales.
  const fallbackColor = colorChannel.manual || DEFAULT_CHART_COLOR;
  const color = resolveColorForRow(row, colorScale, colorChannel.field ?? undefined, fallbackColor);

  // Size resolution. `sizeScale.getSizeForValue` returns a notional radius
  // (consistent with scatter / `r`). When no `sizeField` is set the scale
  // returns the manual radius for every value.
  let radius = DEFAULT_SYMBOL_RADIUS;
  if (input.sizeField) {
    const sizeColumn = getFieldColumnName(input.sizeField);
    const raw = sizeScale.getSizeForValue(row?.[sizeColumn]);
    if (Number.isFinite(raw) && raw > 0) radius = raw;
  } else if (Number.isFinite(input.manualSize as number) && (input.manualSize as number) > 0) {
    radius = input.manualSize as number;
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

/**
 * Build a populated table cell carrying symbols and/or text. Falls back to an
 * empty cell when neither is present, so downstream renderers can skip drawing.
 */
function buildTableCell(
  rowIdx: number,
  colIdx: number,
  symbols: MarkSymbolSpec[],
  rows: TextGridCellRow[],
  fontSize?: number,
): GridCellModel {
  if (symbols.length === 0 && rows.length === 0) {
    return buildEmptyCell(rowIdx, colIdx);
  }
  const content: TableGridCellContent = {
    kind: 'table-cell',
    symbols,
    rows,
    ...(fontSize !== undefined ? { fontSize } : {}),
  };
  return {
    id: `table-cell-${rowIdx}-${colIdx}`,
    position: { row: rowIdx, col: colIdx },
    content,
  };
}

interface TextRowSource {
  source: 'label' | 'measure';
  /** Result-set column carrying the per-row value. */
  column: string;
  /** Display label (alias-aware). */
  label: string;
  /** Originating field, used for value-type-aware formatting (e.g. datetimes). */
  field: Field;
}

function normalizeLabelFieldForResultColumn(field: Field): Field {
  if (field.type !== 'measure' || field.aggregation) return field;
  return {
    ...field,
    aggregation: field.flavour === 'continuous' ? 'sum' : 'count',
  };
}

/**
 * Collect the ordered list of fields contributing per-cell text rows.
 * Text mode is driven solely by `labelFields` (Tableau "Label" / "Text" shelf).
 * Duplicates by result-column are de-duped so the same label only renders once.
 */
function collectTextRowSources(input: TableGridInput): TextRowSource[] {
  const seen = new Set<string>();
  const result: TextRowSource[] = [];

  for (const field of input.labelFields ?? []) {
    const column = getFieldColumnName(normalizeLabelFieldForResultColumn(field));
    if (seen.has(column)) continue;
    seen.add(column);
    result.push({
      source: field.type === 'measure' ? 'measure' : 'label',
      column,
      label: getFieldDisplayName(field, input.fieldAliasLookup),
      field,
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
      value: formatTooltipValue(raw, src.field),
    });
  }
  return rows;
}

function buildTextRowsFromBucket(bucket: any[], sources: TextRowSource[]): TextGridCellRow[] {
  const rows: TextGridCellRow[] = [];
  const seen = new Set<string>();
  for (const row of bucket) {
    for (const textRow of buildTextRowsFromRow(row, sources)) {
      const key = `${textRow.source}\x1f${textRow.label}\x1f${textRow.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(textRow);
    }
  }
  return rows;
}

function buildLayout(rows: number, cols: number): GridLayoutModel {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);
  // Compact rows (Tableau-style table density). Columns flex to fill.
  const columnSizes: GridTrackSize[] = Array.from({ length: safeCols }, () => 'fr');
  const rowSizes: GridTrackSize[] = Array.from({ length: safeRows }, () => MIN_NON_PLOT_GRID_ROW_PX);
  // Table-specific resize floor: allow much denser cells than the generic facet
  // grid (which falls back to MIN_CELL_WIDTH_PX / MIN_CELL_HEIGHT_PX).
  const minColumnSizes: number[] = Array.from({ length: safeCols }, () => TABLE_MIN_CELL_WIDTH_PX);
  const minRowSizes: number[] = Array.from({ length: safeRows }, () => TABLE_MIN_CELL_HEIGHT_PX);
  return {
    type: 'grid',
    columns: safeCols,
    rows: safeRows,
    columnSizes,
    rowSizes,
    minColumnSizes,
    minRowSizes,
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

function buildFacetSpaceContext(input: TableGridInput): FacetSpaceContext {
  const xHeaderFields = discreteHeaderFields(input.xFields);
  const yHeaderFields = discreteHeaderFields(input.yFields);
  const data = Array.isArray(input.rows) ? input.rows : [];
  const facetSpace = buildFacetSpace(data, yHeaderFields, xHeaderFields);
  return {
    xHeaderFields,
    yHeaderFields,
    rowTuples: facetSpace.safeRowCombos,
    colTuples: facetSpace.safeColCombos,
  };
}

/** Aggregations that can be correctly rolled up client-side from a finer grain. */
const DECOMPOSABLE_AGGREGATIONS = new Set(['sum', 'count', 'min', 'max']);

interface MeasureBandSource {
  field: Field;
  /** Result-set column carrying the aggregated value (e.g. `SUM(sales)`). */
  column: string;
  /** Display label (alias-aware) used as the band header. */
  label: string;
}

/**
 * Axis measures contributing value bands, in shelf order. A measure missing an
 * explicit aggregation is normalized to the same default the query planner
 * applies (`sum` for continuous, `count` for discrete) so the result column
 * name matches the aggregated query output.
 */
function collectMeasureBandSources(
  fields: Field[],
  fieldAliasLookup?: Record<string, string>,
): MeasureBandSource[] {
  return fields
    .filter((field) => field.type === 'measure')
    .map((field) => ({
      field,
      column: getFieldColumnName(normalizeLabelFieldForResultColumn(field)),
      label: getFieldDisplayName(field, fieldAliasLookup),
    }));
}

/**
 * Bucket data rows by a single axis's header (dimension) tuple. Rows missing a
 * header column are skipped. With no header fields every row falls into a
 * single bucket (keyed by the empty tuple) — the band carries one value.
 */
function bucketRowsBySingleAxis(data: any[], headerFields: Field[]): Map<string, any[]> {
  const buckets = new Map<string, any[]>();
  for (const row of data) {
    const parts: string[] = [];
    let skip = false;
    for (const field of headerFields) {
      const value = row?.[getFieldColumnName(field)];
      if (value === undefined) {
        skip = true;
        break;
      }
      parts.push(value instanceof Date ? `D:${value.getTime()}` : String(value));
    }
    if (skip) continue;
    const key = parts.join('\x1e');
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(row);
  }
  return buckets;
}

function toFiniteNumber(value: any): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Resolve one band cell value for a leaf from its bucket of (already aggregated)
 * body-grain rows.
 *
 * - A single matching row is already at the band grain → shown verbatim
 *   (correct for every aggregation, including AVG / COUNT_DISTINCT).
 * - Multiple rows must be rolled up to the band grain. This is only correct for
 *   decomposable aggregations (SUM/COUNT/MIN/MAX); non-decomposable ones
 *   (AVG/COUNT_DISTINCT/…) cannot be derived from the finer grain and render
 *   blank until a dedicated band-grain query supplies them.
 */
function resolveBandValue(field: Field, bucket: any[], column: string): string {
  const raws = bucket
    .map((row) => row?.[column])
    .filter((value) => value !== undefined && value !== null);
  if (raws.length === 0) return '';
  if (raws.length === 1) return formatTooltipValue(raws[0], field);

  const aggregation = (field.aggregation
    || (field.flavour === 'continuous' ? 'sum' : 'count')) as string;
  if (!DECOMPOSABLE_AGGREGATIONS.has(aggregation)) return '';

  const nums = raws.map(toFiniteNumber).filter((n): n is number => n !== null);
  if (nums.length === 0) return '';
  let combined: number;
  switch (aggregation) {
    case 'min':
      combined = Math.min(...nums);
      break;
    case 'max':
      combined = Math.max(...nums);
      break;
    default: // sum, count
      combined = nums.reduce((acc, n) => acc + n, 0);
      break;
  }
  return formatTooltipValue(combined, field);
}

/**
 * Build the axis-measure value bands (Tableau "Measure Values"). Y-axis
 * measures become value columns aligned to body rows; X-axis measures become
 * value rows aligned to body columns. Each band value is aggregated at its own
 * axis grain (independent of the other axis) per the table view model.
 */
function buildMeasureBands(
  facetCtx: FacetSpaceContext,
  input: TableGridInput,
): MeasureBands | undefined {
  const ySources = collectMeasureBandSources(input.yFields, input.fieldAliasLookup);
  const xSources = collectMeasureBandSources(input.xFields, input.fieldAliasLookup);
  if (ySources.length === 0 && xSources.length === 0) return undefined;

  const data = Array.isArray(input.rows) ? input.rows : [];
  const yBuckets = bucketRowsBySingleAxis(data, facetCtx.yHeaderFields);
  const xBuckets = bucketRowsBySingleAxis(data, facetCtx.xHeaderFields);

  const rows: MeasureBand[] = ySources.map((src) => ({
    column: src.column,
    label: src.label,
    values: facetCtx.rowTuples.map((tuple) =>
      resolveBandValue(src.field, yBuckets.get(tupleKeyFromValues(tuple)) ?? [], src.column)),
  }));
  const cols: MeasureBand[] = xSources.map((src) => ({
    column: src.column,
    label: src.label,
    values: facetCtx.colTuples.map((tuple) =>
      resolveBandValue(src.field, xBuckets.get(tupleKeyFromValues(tuple)) ?? [], src.column)),
  }));

  return { rows, cols };
}

function buildHeadersForFacetSpace(
  facetCtx: FacetSpaceContext,
  input: TableGridInput,
): GridHeaders | undefined {
  const rowsAxis = buildHeaderAxis(
    facetCtx.yHeaderFields,
    facetCtx.rowTuples.filter((t: any[]) => t.length > 0),
    input.fieldAliasLookup,
  );
  const colsAxis = buildHeaderAxis(
    facetCtx.xHeaderFields,
    facetCtx.colTuples.filter((t: any[]) => t.length > 0),
    input.fieldAliasLookup,
  );
  if (!rowsAxis && !colsAxis) return undefined;
  return { rows: rowsAxis, cols: colsAxis };
}

/**
 * Per-cell symbol resolver, prepared once over the full dataset so symbol
 * radii/colors/shapes are comparable across the whole table. Returns `null`
 * when the table should not render symbols at all (see `shouldRenderSymbols`).
 */
function createSymbolResolver(
  input: TableGridInput,
  data: any[],
): ((bucket: any[]) => MarkSymbolSpec[]) | null {
  if (!shouldRenderSymbols(input)) return null;

  const color = input.color ?? DEFAULT_COLOR_CHANNEL;
  const colorScale = color.field ? deriveColorScaleInfo(data, color) : null;
  const shapeScale = input.shapeField && input.shapeField.flavour === 'discrete'
    ? deriveShapeScaleInfo(data, input.shapeField)
    : null;
  const manualRadius =
    Number.isFinite(input.manualSize as number) && (input.manualSize as number) > 0
      ? (input.manualSize as number)
      : DEFAULT_SYMBOL_RADIUS;
  const sizeScale = createSizeScale(
    data,
    input.sizeField ?? null,
    input.sizeRange ?? [manualRadius, manualRadius],
    manualRadius,
  );

  return (bucket: any[]) =>
    aggregateSymbols(
      bucket.map((row) => buildSymbolForRow(row, input, color, shapeScale, colorScale, sizeScale)),
    );
}

/**
 * Build the cell list. Every (rowTuple, colTuple) bucket of data rows is
 * resolved into a combined cell carrying both symbols (when the table renders
 * symbols) and text rows (one per label source). A bucket that yields neither
 * — or has no matching rows at all — becomes an empty cell.
 *
 * The query is planned as aggregated, but label dimensions can still produce
 * multiple rows per X/Y cell, so every bucket row is considered and duplicate
 * rendered text rows are collapsed.
 */
function buildCells(
  facetCtx: FacetSpaceContext,
  input: TableGridInput,
): GridCellModel[] {
  const data = Array.isArray(input.rows) ? input.rows : [];
  const resolveSymbols = createSymbolResolver(input, data);
  const sources = collectTextRowSources(input);

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
      const symbols = resolveSymbols ? resolveSymbols(bucket) : [];
      const textRows = sources.length > 0 ? buildTextRowsFromBucket(bucket, sources) : [];
      cells.push(buildTableCell(r, c, symbols, textRows, input.labelFontSize));
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
 * Every cell may carry symbols and/or text (see `buildCells`). Row/column
 * headers come from the discrete dimensions on the Y/X axes.
 *
 * When `tablePageSize > 0` is provided in the context, the generator slices
 * the distinct row-tuples to the requested page window. The full data set is
 * still bucketed (cells outside the page window are simply not emitted). The
 * total row-tuple count and effective page index are surfaced via the
 * `pagination` field on the returned grid for the UI pager.
 */
export function generateTableGrid(input: TableGridInput): GridResultModel {
  const facetCtx = buildFacetSpaceContext(input);

  const totalRowTuples = facetCtx.rowTuples.length;
  const pageSize = sanitizePageSize(input.tablePageSize);
  const page = sanitizePage(input.tablePage, totalRowTuples, pageSize);

  const pagedFacetCtx: FacetSpaceContext = pageSize > 0
    ? {
        ...facetCtx,
        rowTuples: facetCtx.rowTuples.slice(page * pageSize, (page + 1) * pageSize),
      }
    : facetCtx;

  const cells = buildCells(pagedFacetCtx, input);

  return {
    cells,
    layout: buildLayout(pagedFacetCtx.rowTuples.length, pagedFacetCtx.colTuples.length),
    headers: buildHeadersForFacetSpace(pagedFacetCtx, input),
    measureBands: buildMeasureBands(pagedFacetCtx, input),
    pagination: pageSize > 0
      ? { totalRowTuples, pageSize, page }
      : undefined,
  };
}
