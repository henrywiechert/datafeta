// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * The aggregation registry: one row per aggregation, read by every consumer.
 *
 * An aggregation surfaces in a lot of places -- the field menu, the chip label,
 * the result-column alias, the local DuckDB-WASM query, the client-side roll-up
 * behind cell charts and the table grid, and the decision to force a query to
 * the backend.  Each of those used to carry its own list, and the two builders
 * silently fell back to SUM for anything they did not recognise, so a missing
 * entry produced wrong numbers under a correct-looking label instead of an
 * error.
 *
 * `Aggregation` is derived from the keys below, so adding a row here is what
 * makes a new aggregation exist: every consumer either picks it up or fails to
 * compile.
 */

/** Column expressions a local (DuckDB-WASM) aggregate can be built from. */
export interface LocalColumnExprs {
  /** Quoted column reference. */
  raw: string;
  /** Column coerced to a number, with NaN/Inf mapped to NULL. */
  numeric: string;
}

/** How an already-aggregated column is combined when rolled up to a coarser grain. */
export interface AggregationRollup {
  combine: (values: number[]) => number;
  /**
   * Whether the roll-up reproduces what a query at the coarser grain would
   * return.  Averaging averages ignores group sizes and summing distinct counts
   * double-counts values shared between groups, so both are inexact; consumers
   * that must not display a wrong number require `exact`.
   */
  exact: boolean;
}

export interface AggregationSpec {
  /** Short lowercase display name, used in menus and chip labels. */
  label: string;
  /** Uppercase token in the result-column alias, e.g. `SUM(sales)`. */
  aliasPrefix: string;
  /** Only offered on numeric fields; summing strings is meaningless. */
  numericOnly: boolean;
  /** Needs an ordering column (`Field.aggregationArg`) to be well-defined. */
  needsOrderingColumn: boolean;
  /**
   * Whether the result keeps the source column's type.  A median or min of a
   * datetime column is still a timestamp and must be formatted as a date; a
   * count of one is a plain integer.
   */
  preservesColumnType: boolean;
  /**
   * Expression over the locally cached slice, or null when the aggregation
   * cannot be computed in the browser and the query must go to the backend.
   */
  localSql: ((col: LocalColumnExprs) => string) | null;
  /** Client-side roll-up from a finer grain, or null when it cannot be derived. */
  rollup: AggregationRollup | null;
}

const total = (values: number[]): number => values.reduce((acc, v) => acc + v, 0);

/**
 * Key order is menu order.  It preserves the order users saw before the
 * registry existed (sum, avg, min, max, count, count_distinct); median sits
 * next to avg, the other measure of central tendency.
 */
export const AGGREGATIONS = {
  sum: {
    label: 'sum',
    preservesColumnType: true,
    aliasPrefix: 'SUM',
    numericOnly: true,
    needsOrderingColumn: false,
    localSql: (col) => `SUM(${col.numeric})`,
    rollup: { combine: total, exact: true },
  },
  avg: {
    label: 'avg',
    preservesColumnType: true,
    aliasPrefix: 'AVG',
    numericOnly: true,
    needsOrderingColumn: false,
    localSql: (col) => `AVG(${col.numeric})`,
    // A mean of per-group means weights every group equally.
    rollup: { combine: (values) => total(values) / values.length, exact: false },
  },
  median: {
    label: 'median',
    preservesColumnType: true,
    aliasPrefix: 'MEDIAN',
    numericOnly: true,
    needsOrderingColumn: false,
    // quantile_cont(x, 0.5) is what the backend and the box plot both use, so
    // all three agree. The FILTER mirrors the backend's guard: a NaN sorts
    // highest and would shift the median instead of making it obviously wrong.
    localSql: (col) =>
      `quantile_cont(${col.numeric}, 0.5) FILTER (WHERE isFinite(${col.numeric}))`,
    // A median of per-group medians is not the median.
    rollup: null,
  },
  min: {
    label: 'min',
    preservesColumnType: true,
    aliasPrefix: 'MIN',
    numericOnly: false,
    needsOrderingColumn: false,
    localSql: (col) => `MIN(${col.numeric})`,
    rollup: { combine: (values) => Math.min(...values), exact: true },
  },
  max: {
    label: 'max',
    preservesColumnType: true,
    aliasPrefix: 'MAX',
    numericOnly: false,
    needsOrderingColumn: false,
    localSql: (col) => `MAX(${col.numeric})`,
    rollup: { combine: (values) => Math.max(...values), exact: true },
  },
  count: {
    label: 'count',
    preservesColumnType: false,
    aliasPrefix: 'COUNT',
    numericOnly: false,
    needsOrderingColumn: false,
    localSql: (col) => `COUNT(${col.raw})`,
    // Per-group counts add up.
    rollup: { combine: total, exact: true },
  },
  count_distinct: {
    label: 'count_distinct',
    preservesColumnType: false,
    aliasPrefix: 'COUNT_DISTINCT',
    numericOnly: false,
    needsOrderingColumn: false,
    localSql: (col) => `COUNT(DISTINCT ${col.raw})`,
    // Distinct counts only add up when no value appears in two groups.
    rollup: { combine: total, exact: false },
  },
  arg_max: {
    label: 'latest',
    preservesColumnType: true,
    aliasPrefix: 'LATEST',
    numericOnly: false,
    needsOrderingColumn: true,
    // The ordering column is not projected into the local cache, so the value
    // at its maximum cannot be recovered here.
    localSql: null,
    rollup: null,
  },
  arg_min: {
    label: 'earliest',
    preservesColumnType: true,
    aliasPrefix: 'EARLIEST',
    numericOnly: false,
    needsOrderingColumn: true,
    localSql: null,
    rollup: null,
  },
} as const satisfies Record<string, AggregationSpec>;

export type Aggregation = keyof typeof AGGREGATIONS;

/** Every aggregation, in menu order. */
export const AGGREGATION_NAMES = Object.keys(AGGREGATIONS) as Aggregation[];

export function isAggregation(value: string | undefined): value is Aggregation {
  return value !== undefined && Object.prototype.hasOwnProperty.call(AGGREGATIONS, value);
}

export function getAggregationSpec(value: string | undefined): AggregationSpec | undefined {
  return isAggregation(value) ? AGGREGATIONS[value] : undefined;
}

/**
 * Aggregations offered in the plain field menu.
 *
 * arg_max/arg_min are excluded: they are meaningless without an ordering column,
 * so the menu offers them through a dedicated "Latest/Earliest value by …"
 * submenu instead.
 */
export function menuAggregations(isNumeric: boolean): Aggregation[] {
  return AGGREGATION_NAMES.filter((name) => {
    const spec = AGGREGATIONS[name];
    if (spec.needsOrderingColumn) return false;
    return isNumeric || !spec.numericOnly;
  });
}

/** Uppercase token for a measure's result column, e.g. `SUM` -> `SUM(sales)`. */
export function aggregationAliasPrefix(value: string): string {
  return getAggregationSpec(value)?.aliasPrefix ?? value.toUpperCase();
}

/** Short display label for chips and menus, e.g. `latest` for arg_max. */
export function aggregationLabel(value: string): string {
  return getAggregationSpec(value)?.label ?? value;
}

/** Whether the aggregation can be computed in the browser over the cached slice. */
export function canComputeLocally(value: string | undefined): boolean {
  return getAggregationSpec(value)?.localSql != null;
}
