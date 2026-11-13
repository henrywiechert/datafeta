// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Series rebase for line charts ("compare growth", as in stock comparison
 * charts): every line is divided by its value at the left edge of what is
 * visible, so all lines start at 100 there.
 *
 * Purely presentational: it transforms the rows of one grid cell before the
 * line builder and the overlays see them, so axis domain, tooltips, labels,
 * reference lines and facet harmonization all agree on the rebased values.
 * Nothing reaches the query. Pan/zoom commits regenerate the chart from the
 * same rows with the new viewport, which re-anchors the lines.
 *
 * Anchor per series: the earliest row at or after the viewport's left edge
 * (the series' first row without a viewport). A series lying entirely left of
 * the view is anchored at its last row instead, so it stays in the data (and
 * in the pannable extent) while off screen. A series whose anchor is zero or
 * negative cannot be indexed and is dropped (its values become null).
 */
import type { Field, LineColorMode } from '../../../types';
import { lineColorSplitsSeries } from '../../../utils/lineColorEncoding';
import { getFieldDisplayName, getResultColumnName } from '../../../utils/fieldUtils';
import { isMeasureValuesField, MEASURE_NAMES_FIELD } from '../../../utils/syntheticFields';
import type { CellChartType } from '../../helpers/chartTypeResolver';
import { getFieldColumnName } from '../../helpers/fields';
import { CartesianCellPredictionInput, predictCartesianCells } from '../../grid/cartesianCellPrediction';
import type { ChartViewport, ViewportRange } from '../../viewport/chartViewport';
import { inferXKind, seriesKeyOf, toXNumber } from './dataPrep';

/** Value every series takes at its anchor. */
export const SERIES_REBASE_BASE = 100;

/** Suffix for the measure label of a rebased cell (axis title, tooltip). */
export const SERIES_REBASE_LABEL_SUFFIX = ' (index)';

export interface RebasableLineCell {
  /** Continuous dimension the lines run along (time or numeric). */
  dimensionField: Field;
  /** Measure that gets rebased. */
  measureField: Field;
}

/**
 * Whether a grid cell renders as a line along a continuous dimension and can
 * therefore be rebased. Mirrors the line routing in cellCharts' handleLine:
 * measure vs discrete dimension takes the bar layout, two measures or two
 * dimensions fall back to scatter.
 */
export function resolveRebasableLineCell(
  xField: Field,
  yField: Field,
  cellChartType: CellChartType,
): RebasableLineCell | null {
  if (cellChartType !== 'line') return null;
  if (xField.type === 'dimension' && xField.flavour === 'continuous' && yField.type === 'measure') {
    return { dimensionField: xField, measureField: yField };
  }
  if (yField.type === 'dimension' && yField.flavour === 'continuous' && xField.type === 'measure') {
    return { dimensionField: yField, measureField: xField };
  }
  return null;
}

/**
 * Whether the rebase would change at least one rendered cell (drives the
 * toolbar toggle). Same cell prediction and per-cell rule as the generator,
 * which leaves multi-mark Measure Values cells alone.
 */
export function canRebaseLineSeries(input: CartesianCellPredictionInput): boolean {
  return predictCartesianCells(input).some(({ xField, yField, cellChartType, multiMark }) =>
    !multiMark && resolveRebasableLineCell(xField, yField, cellChartType) !== null,
  );
}

/**
 * Index each series to its value at the left edge of the viewport (= 100).
 * Returns new row objects for rows with a numeric dependent value; the input
 * rows are shared across cells and never mutated.
 */
export function rebaseSeriesToFirstVisible(
  rows: any[],
  params: {
    independentColumn: string;
    dependentColumn: string;
    /** Columns that split the rows into separate lines; empty for one line. */
    seriesColumns: readonly string[];
    /** Pan/zoom window on the independent axis; absent = anchor at each series' start. */
    viewport?: ViewportRange;
  },
): any[] {
  const { independentColumn, dependentColumn, seriesColumns, viewport } = params;
  if (rows.length === 0) return rows;

  const kind = inferXKind(rows.slice(0, 25).map((row) => row?.[independentColumn]));
  const leftEdge = viewport?.min ?? -Infinity;

  // Per series: earliest point at/after the left edge, latest point before it.
  const firstInView = new Map<string, { x: number; value: number }>();
  const lastBeforeView = new Map<string, { x: number; value: number }>();
  const keys: Array<string | undefined> = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const value = row?.[dependentColumn];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const x = toXNumber(row?.[independentColumn], kind);
    if (x == null) continue;
    const key = seriesKeyOf(row, seriesColumns);
    keys[i] = key;
    if (x >= leftEdge) {
      const current = firstInView.get(key);
      if (!current || x < current.x) firstInView.set(key, { x, value });
    } else {
      const current = lastBeforeView.get(key);
      if (!current || x > current.x) lastBeforeView.set(key, { x, value });
    }
  }

  let droppedSeries = 0;
  const anchors = new Map<string, number | null>();
  const setAnchor = (key: string) => {
    if (anchors.has(key)) return;
    const anchor = (firstInView.get(key) ?? lastBeforeView.get(key))!.value;
    if (anchor <= 0) droppedSeries++;
    anchors.set(key, anchor > 0 ? anchor : null);
  };
  firstInView.forEach((_, key) => setAnchor(key));
  lastBeforeView.forEach((_, key) => setAnchor(key));
  if (droppedSeries > 0) {
    console.warn(
      `[seriesRebase] ${droppedSeries} series dropped: their first visible ${dependentColumn} value is zero or negative and cannot be indexed`,
    );
  }

  return rows.map((row, i) => {
    const key = keys[i];
    if (key === undefined) return row;
    const anchor = anchors.get(key);
    const value = row[dependentColumn] as number;
    // value / anchor first, so the anchor row itself is exactly 100.
    return { ...row, [dependentColumn]: anchor ? (value / anchor) * SERIES_REBASE_BASE : null };
  });
}

/**
 * Rebase the rows of one grid cell when it renders as a line along a
 * continuous dimension. Returns null when the cell is not rebasable.
 *
 * The returned fields replace the cell's fields for chart building only: the
 * measure carries an "(index)" label so axis title and tooltip say what the
 * numbers are.
 */
export function rebaseLineCell(params: {
  data: any[];
  xField: Field;
  yField: Field;
  cellChartType: CellChartType;
  colorField?: Field | null;
  lineColorMode?: LineColorMode;
  lineStyleField?: Field | null;
  chartViewport?: ChartViewport | null;
}): { data: any[]; xField: Field; yField: Field } | null {
  const { data, xField, yField, cellChartType, colorField, lineColorMode, lineStyleField, chartViewport } = params;
  const cell = resolveRebasableLineCell(xField, yField, cellChartType);
  if (!cell) return null;

  const independentColumn = getFieldColumnName(cell.dimensionField);
  // Same series split as buildLineOptions, plus Measure Names so unpivoted
  // measures sharing one value column are indexed separately.
  const seriesColumns = [
    ...(colorField && lineColorSplitsSeries(colorField, lineColorMode) ? [getResultColumnName(colorField)] : []),
    ...(lineStyleField ? [getResultColumnName(lineStyleField)] : []),
    ...(isMeasureValuesField(cell.measureField) ? [MEASURE_NAMES_FIELD] : []),
  ];

  const rebasedData = rebaseSeriesToFirstVisible(data, {
    independentColumn,
    dependentColumn: getFieldColumnName(cell.measureField),
    seriesColumns: Array.from(new Set(seriesColumns)),
    viewport: chartViewport?.[independentColumn],
  });

  const measureField: Field = {
    ...cell.measureField,
    displayAlias: `${getFieldDisplayName(cell.measureField)}${SERIES_REBASE_LABEL_SUFFIX}`,
  };
  return {
    data: rebasedData,
    xField: cell.measureField === xField ? measureField : xField,
    yField: cell.measureField === yField ? measureField : yField,
  };
}
