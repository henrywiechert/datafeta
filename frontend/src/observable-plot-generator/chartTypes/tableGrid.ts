/**
 * `table-refactor` chart type generator.
 *
 * Builds a Tableau-style table directly as a `GridResultModel` (without going
 * through the legacy `PlotResult` pipeline). PR 6 implements `symbol` mode
 * only; `text` mode and the full `auto` resolution arrive in PR 7.
 *
 * Layout:
 * - Row headers come from the discrete dimensions on the Y axis (in order).
 * - Column headers come from the discrete dimensions on the X axis.
 * - Each cell aggregates the data rows that match its (rowTuple, colTuple)
 *   pair into one or more `MarkSymbolSpec`s. Mixed values produce a
 *   preview-stack rendering in `MarkCell` (see `discreteGridSymbolLayout`).
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
} from '../gridModel';
import { ChartGenerationContext } from '../types';
import { buildFacetSpace } from '../faceting/facetSpace';
import { getFieldColumnName } from '../helpers/fields';
import { getFieldDisplayName } from '../../utils/fieldUtils';
import { DEFAULT_CHART_COLOR, MIN_NON_PLOT_GRID_ROW_PX } from '../../config/chartLayoutConfig';
import {
  deriveShapeScaleInfo,
  getSymbolForValue,
  isManualShapeOption,
  MANUAL_NO_SHAPE,
  ShapeScaleInfo,
} from '../utils/shapeUtils';
import { deriveColorScaleInfo, ColorScaleInfo } from '../utils/colorSchemeUtils';

/** Default symbol used when no shape encoding resolves to a specific shape. */
const DEFAULT_SYMBOL = 'circle';

/**
 * Default mark area for table-refactor symbol cells.
 * `MarkCell` interprets `size` as Plot-style symbol area (π · r²).
 * The chosen value renders ~16 viewBox units across (a roughly 16% wide
 * symbol inside a 100×100 cell viewBox).
 */
const DEFAULT_MARK_AREA = 200;

/**
 * Resolve `auto` to the concrete cell mode used in PR 6.
 * PR 7 will refine this to `text` when measures or label fields are present.
 */
export function resolveTableCellMode(_context: ChartGenerationContext, mode: TableCellMode): 'text' | 'symbol' {
  if (mode === 'text') return 'text';
  // PR 6 default: every non-`text` selection (incl. `auto`) renders symbols.
  return 'symbol';
}

interface SymbolFingerprint {
  symbol: string;
  color: string;
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
): SymbolFingerprint {
  // Symbol resolution
  let symbol: string = DEFAULT_SYMBOL;
  if (context.shapeField && shapeScale) {
    const shapeColumn = getFieldColumnName(context.shapeField);
    symbol = getSymbolForValue(row?.[shapeColumn], shapeScale);
  } else if (context.manualShape && isManualShapeOption(context.manualShape) && context.manualShape !== MANUAL_NO_SHAPE) {
    symbol = context.manualShape;
  }

  // Color resolution: discrete colorField → categorical lookup; manual otherwise.
  let color: string = context.manualColor || DEFAULT_CHART_COLOR;
  if (context.colorField && colorScale && colorScale.kind === 'categorical') {
    const colorColumn = getFieldColumnName(context.colorField);
    const value = row?.[colorColumn];
    const domain = colorScale.domain as any[];
    const idx = domain.findIndex((d) => {
      if (d instanceof Date && value instanceof Date) return d.getTime() === value.getTime();
      return d === value;
    });
    if (idx >= 0 && colorScale.range.length > 0) {
      color = colorScale.range[idx % colorScale.range.length];
    }
  }

  return { symbol, color };
}

function aggregateSymbols(specs: SymbolFingerprint[]): MarkSymbolSpec[] {
  const seen = new Map<string, MarkSymbolSpec>();
  for (const spec of specs) {
    const key = fingerprint(spec);
    if (!seen.has(key)) {
      seen.set(key, { symbol: spec.symbol, color: spec.color, size: DEFAULT_MARK_AREA });
    }
  }
  return Array.from(seen.values());
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

/**
 * Generate a table grid as a `GridResultModel`.
 *
 * In PR 6 only `symbol` mode is implemented: every non-`text` cell mode
 * (including `auto`) resolves to symbol marks. PR 7 will introduce text mode.
 */
export function generateTableGrid(context: ChartGenerationContext): GridResultModel {
  const { xFields, yFields, queryResult } = context;
  const data = Array.isArray(queryResult?.rows) ? queryResult.rows : [];

  const xHeaderFields = discreteHeaderFields(xFields);
  const yHeaderFields = discreteHeaderFields(yFields);

  const facetSpace = buildFacetSpace(data, yHeaderFields, xHeaderFields);
  // safeRowCombos / safeColCombos always have at least [[]] when no fields.
  const rowTuples = facetSpace.safeRowCombos;
  const colTuples = facetSpace.safeColCombos;

  // Empty data path: still render the header skeleton so the user sees their
  // shelf configuration reflected.
  const colorScale = context.colorField
    ? deriveColorScaleInfo(data, context.colorField, context.colorScheme, context.colorBias)
    : null;
  const shapeScale = context.shapeField && context.shapeField.flavour === 'discrete'
    ? deriveShapeScaleInfo(data, context.shapeField)
    : null;

  // Bucket rows by (rowTupleKey, colTupleKey) so each cell only iterates over
  // its own rows when resolving symbols.
  const buckets = new Map<string, SymbolFingerprint[]>();
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

    const key = `${rowTupleParts.join('\x1e')}\x1f${colTupleParts.join('\x1e')}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(buildSymbolForRow(row, context, shapeScale, colorScale));
  }

  // Materialize cells in (rowTuple × colTuple) order.
  const cells: GridCellModel[] = [];
  for (let r = 0; r < rowTuples.length; r++) {
    const rowTuple = rowTuples[r];
    const rowTupleParts = rowTuple.map((v: any) => (v instanceof Date ? `D:${v.getTime()}` : String(v)));
    for (let c = 0; c < colTuples.length; c++) {
      const colTuple = colTuples[c];
      const colTupleParts = colTuple.map((v: any) => (v instanceof Date ? `D:${v.getTime()}` : String(v)));
      const key = `${rowTupleParts.join('\x1e')}\x1f${colTupleParts.join('\x1e')}`;
      const symbols = aggregateSymbols(buckets.get(key) ?? []);
      cells.push(symbols.length > 0 ? buildMarkCell(r, c, symbols) : buildEmptyCell(r, c));
    }
  }

  const headers: GridHeaders | undefined = (() => {
    const rowsAxis = buildHeaderAxis(yHeaderFields, rowTuples.filter((t: any[]) => t.length > 0), context);
    const colsAxis = buildHeaderAxis(xHeaderFields, colTuples.filter((t: any[]) => t.length > 0), context);
    if (!rowsAxis && !colsAxis) return undefined;
    return { rows: rowsAxis, cols: colsAxis };
  })();

  return {
    cells,
    layout: buildLayout(rowTuples.length, colTuples.length),
    headers,
  };
}
