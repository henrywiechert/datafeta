// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import type { Field, LineColorMode } from '../../../types';
import { lineColorSplitsSeries } from '../../../utils/lineColorEncoding';
import type { LineBudget, LineOrientation, PreparedLineData, XKind } from './types';

const LINE_POINT_BUDGET = 1_000;
const DISCRETE_LINE_MIN_POINTS_PER_SERIES = 200;
const LINE_DOT_BUDGET = 2_000;
const DISCRETE_LINE_DOT_BUDGET = 5_000;

function computeLineBudget(hasDiscreteColor: boolean): LineBudget {
  // Lines (and dots) can stack overflow when we render hundreds of thousands of points.
  // Dots are heavier than line segments so they get a separate (lower) cap.
  return {
    maxPoints: LINE_POINT_BUDGET,
    minPerSeries: hasDiscreteColor ? DISCRETE_LINE_MIN_POINTS_PER_SERIES : 0,
    // 5_000 lets typical multi-series datasets (e.g. 200 countries x 25 years)
    // show every dot while still protecting against stack overflows.
    maxDots: hasDiscreteColor ? DISCRETE_LINE_DOT_BUDGET : LINE_DOT_BUDGET,
  };
}

function inferXKind(sampleValues: any[]): XKind {
  for (const v of sampleValues) {
    if (v instanceof Date) return 'time';
    if (typeof v === 'number' && Number.isFinite(v)) return 'number';
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) continue;
      // If it's a pure number string, treat as numeric.
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return 'number';
      const ts = Date.parse(t);
      if (!Number.isNaN(ts)) return 'time';
    }
  }
  return 'other';
}

function toXNumber(v: any, kind: XKind): number | null {
  if (kind === 'time') {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string') {
      const ts = Date.parse(v);
      return Number.isNaN(ts) ? null : ts;
    }
    return null;
  }
  if (kind === 'number') {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const num = Number.parseFloat(v);
      return Number.isFinite(num) ? num : null;
    }
    if (v instanceof Date) return v.getTime();
    return null;
  }
  // other: try best-effort numeric conversion, else null
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const ts = Date.parse(v);
    if (!Number.isNaN(ts)) return ts;
    const num = Number.parseFloat(v);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

/**
 * Bin-aggregate a line series so we end up with ~one point per x "position".
 * This makes line charts readable (unlike scatter) and avoids vertical hairballs when x has many distinct values.
 *
 * For now we keep it simple: average Y per bin. (Min/max envelope is a follow-up.)
 */
function binAggregateLine(
  rowsSorted: any[],
  xColumn: string,
  yColumn: string,
  opts: {
    maxBins: number;
    xKind: XKind;
  }
): any[] {
  const n = rowsSorted.length;
  const { maxBins, xKind } = opts;
  if (n <= maxBins || maxBins <= 0) return rowsSorted;

  // Build numeric x values and global span
  let minX = Infinity;
  let maxX = -Infinity;
  const xs: Array<number | null> = new Array(n);
  for (let i = 0; i < n; i++) {
    const xNum = toXNumber(rowsSorted[i]?.[xColumn], xKind);
    xs[i] = xNum;
    if (xNum == null) continue;
    if (xNum < minX) minX = xNum;
    if (xNum > maxX) maxX = xNum;
  }
  if (minX === Infinity || maxX === -Infinity) {
    // Fallback: uniform stride sample
    const stride = Math.ceil(n / maxBins);
    const out: any[] = [];
    for (let i = 0; i < n; i += stride) out.push(rowsSorted[i]);
    if (out[out.length - 1] !== rowsSorted[n - 1]) out.push(rowsSorted[n - 1]);
    return out;
  }

  const span = maxX - minX;
  if (span === 0) {
    // All x identical -> just average y into a single point.
    let sumY = 0;
    let cnt = 0;
    for (const r of rowsSorted) {
      const y = r?.[yColumn];
      if (typeof y === 'number' && Number.isFinite(y)) {
        sumY += y;
        cnt++;
      }
    }
    const yAvg = cnt ? sumY / cnt : 0;
    const xVal = xKind === 'time' ? new Date(minX) : minX;
    return [{ ...rowsSorted[0], [xColumn]: xVal, [yColumn]: yAvg }];
  }

  const bins = Math.min(maxBins, n);
  const binWidth = span / bins;

  type Acc = { sumX: number; sumY: number; cnt: number };
  const accs: Acc[] = Array.from({ length: bins }, () => ({ sumX: 0, sumY: 0, cnt: 0 }));

  for (let i = 0; i < n; i++) {
    const xNum = xs[i];
    const y = rowsSorted[i]?.[yColumn];
    if (xNum == null) continue;
    if (typeof y !== 'number' || !Number.isFinite(y)) continue;
    let b = Math.floor((xNum - minX) / binWidth);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    const a = accs[b];
    a.sumX += xNum;
    a.sumY += y;
    a.cnt += 1;
  }

  const out: any[] = [];
  for (let b = 0; b < bins; b++) {
    const a = accs[b];
    if (a.cnt === 0) continue;
    const xAvg = a.sumX / a.cnt;
    const yAvg = a.sumY / a.cnt;
    const xVal = xKind === 'time' ? new Date(xAvg) : xAvg;
    out.push({ ...rowsSorted[0], [xColumn]: xVal, [yColumn]: yAvg });
  }

  return out;
}

function sampleEvery<T>(arr: T[], maxCount: number): T[] {
  if (arr.length <= maxCount) return arr;
  const stride = Math.ceil(arr.length / maxCount);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += stride) out.push(arr[i]);
  // ensure last point present (helps hover at end)
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

/**
 * Convert a value to a comparable form for sorting (number, string, or null).
 * Handles Date, number, and string (with numeric/date parsing).
 */
function toComparable(v: any): number | string | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const num = Number.parseFloat(v);
    if (Number.isFinite(num)) return num;
    const ts = Date.parse(v);
    if (!Number.isNaN(ts)) return ts;
    return v; // fallback lexical
  }
  return null;
}

export function normalizeTooltipComparisonKey(value: any): string {
  if (value == null) return '__NULL__';
  if (value instanceof Date) return `__DATE__:${value.valueOf()}`;
  if (typeof value === 'number' && Number.isFinite(value)) return `__NUM__:${value}`;
  if (typeof value === 'string') return `__STR__:${value}`;
  if (typeof value === 'boolean') return `__BOOL__:${value}`;
  return `__OTHER__:${String(value)}`;
}

export function groupRowsByColorSeries(rows: any[], colorColumnName: string): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = normalizeTooltipComparisonKey(row?.[colorColumnName]);
    const seriesRows = groups.get(key) || [];
    seriesRows.push(row);
    groups.set(key, seriesRows);
  }
  return groups;
}

/**
 * Sort comparator using toComparable for a given column.
 */
function compareByColumn(column: string) {
  return (a: any, b: any): number => {
    const av = toComparable(a[column]);
    const bv = toComparable(b[column]);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv));
    return (av as number) - (bv as number);
  };
}

export function prepareLineData(params: {
  data: any[];
  independentColumn: string;
  dependentColumn: string;
  colorField?: Field;
  colorColumnName?: string;
  orientation: LineOrientation;
  lineColorMode?: LineColorMode;
}): PreparedLineData {
  const { data, independentColumn, dependentColumn, colorField, colorColumnName, orientation, lineColorMode } = params;

  // Filter to finite numeric values for the dependent axis
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[dependentColumn]))
    : [];

  // Sort by the independent axis so the line flows correctly
  const cleanSorted = clean.slice().sort(compareByColumn(independentColumn));

  // ---- Auto bin-aggregation (line-specific) --------------------------------
  const splitsSeries = lineColorSplitsSeries(colorField, lineColorMode);
  const budget = computeLineBudget(splitsSeries);
  const axisKind: XKind = inferXKind(cleanSorted.slice(0, 25).map(r => r?.[independentColumn]));

  const maxBins = budget.maxPoints;
  let budgetedSorted = cleanSorted;
  if (cleanSorted.length > maxBins) {
    if (splitsSeries && colorColumnName) {
      // Group by color, bin-aggregate each group separately
      const groups = groupRowsByColorSeries(cleanSorted, colorColumnName);
      const reduced: any[] = [];
      for (const [, arr] of Array.from(groups.entries())) {
        const arrSorted = arr.slice().sort(compareByColumn(independentColumn));
        reduced.push(...binAggregateLine(arrSorted, independentColumn, dependentColumn, { maxBins, xKind: axisKind }));
      }
      budgetedSorted = reduced.slice().sort(compareByColumn(independentColumn));
    } else {
      budgetedSorted = binAggregateLine(cleanSorted, independentColumn, dependentColumn, { maxBins, xKind: axisKind });
    }
    const chartLabel = orientation === 'horizontal' ? 'Line' : 'Vertical line';
    console.warn(`⚠️ ${chartLabel} bin-aggregate applied: ${cleanSorted.length} → ${budgetedSorted.length} points (axisKind=${axisKind})`);
  }

  // Dots are expensive at scale; cap dot density separately.
  // When there is a discrete color field (multiple series), sample per-series so
  // that the stride is independent of backend row order — otherwise a global
  // stride can skip entire countries or pick different rows on each re-query.
  // Use the actual total dot count to decide whether sampling is needed at all;
  // if the data already fits within the budget, show every point.
  let dotData: any[];
  if (splitsSeries && colorColumnName) {
    if (budgetedSorted.length <= budget.maxDots) {
      // All points fit within budget — no need to sample
      dotData = budgetedSorted;
    } else {
      const seriesGroups = groupRowsByColorSeries(budgetedSorted, colorColumnName);
      const numSeries = seriesGroups.size || 1;
      const perSeriesMax = Math.max(2, Math.floor(budget.maxDots / numSeries));
      const perSeriesResult: any[] = [];
      for (const [, arr] of Array.from(seriesGroups.entries())) {
        const arrSorted = arr.slice().sort(compareByColumn(independentColumn));
        perSeriesResult.push(...sampleEvery(arrSorted, perSeriesMax));
      }
      dotData = perSeriesResult;
    }
  } else {
    dotData = sampleEvery(budgetedSorted, budget.maxDots);
  }

  return {
    clean,
    budgetedSorted,
    dotData,
    axisKind,
  };
}
