// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Reference Lines Overlay Builder
 *
 * Dashed rules across the value axis at summary statistics of the plotted data
 * (mean, median, a percentile, min, max) and/or at a fixed value, each with a
 * small label at the frame edge ("P95 12.3").
 *
 * Statistics are computed here rather than with Plot's group transforms: the
 * label needs the number, and a single pass gives both. Each grid cell gets its
 * own data, so faceted charts get per-facet statistics for free.
 *
 * Labels carry the series-end dodge class so the renderer's de-overlap pass
 * spaces them out (with leader lines) when several lines sit close together.
 */

import * as Plot from '@observablehq/plot';
import { OverlayParams, ReferenceStat, REFERENCE_LINE_CLASS, OVERLAY_NO_HIGHLIGHT_CLASS, normalizePercentile } from './types';
import { DEFAULT_OVERLAY_COLOR } from '../../config/colorSchemes';
import { T } from '../../theme/tokens';
import { formatNumericTick } from '../utils/numericTickFormat';
import { formatDateTick } from '../utils/dateFormatUtils';
import {
  SERIES_END_LABEL_DODGE_X_CLASS,
  SERIES_END_LABEL_DODGE_Y_CLASS,
  SERIES_LABEL_FONT_SIZE,
} from '../utils/seriesEndLabels';

const VALUE_KEY = '__refValue';
const LABEL_KEY = '__refLabel';

const STAT_ORDER: readonly ReferenceStat[] = ['min', 'median', 'mean', 'percentile', 'max'];

const STAT_LABELS: Record<Exclude<ReferenceStat, 'percentile'>, string> = {
  mean: 'Mean',
  median: 'Median',
  min: 'Min',
  max: 'Max',
};

/** Linear-interpolated quantile of an ascending array (same method as d3.quantile). */
function quantileSorted(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function statValue(stat: ReferenceStat, sorted: number[], percentile: number): number {
  switch (stat) {
    case 'mean': return sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    case 'median': return quantileSorted(sorted, 0.5);
    case 'percentile': return quantileSorted(sorted, percentile / 100);
    case 'min': return sorted[0];
    case 'max': return sorted[sorted.length - 1];
  }
}

function statLabel(stat: ReferenceStat, percentile: number): string {
  return stat === 'percentile' ? `P${percentile}` : STAT_LABELS[stat];
}

/**
 * The finite values of `column`, as numbers. Dates are reduced to epoch ms;
 * the caller converts results back so a time axis receives Dates.
 */
function numericValues(rows: any[], column: string): { values: number[]; isTime: boolean } {
  const values: number[] = [];
  let isTime = false;
  for (const row of rows) {
    const raw = row?.[column];
    if (raw instanceof Date) {
      isTime = true;
      const t = raw.getTime();
      if (Number.isFinite(t)) values.push(t);
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      values.push(raw);
    }
  }
  return { values, isTime };
}

export interface ReferenceLineRow {
  [VALUE_KEY]: number | Date;
  [LABEL_KEY]: string;
  [group: string]: any;
}

export interface ReferenceRows {
  /** Selected statistics, one row per statistic per group. */
  stats: ReferenceLineRow[];
  /** The user's fixed value, if any. Never grouped. */
  fixed: ReferenceLineRow[];
}

/**
 * The selected statistics for each group (or for all rows), plus the fixed
 * value if one is set.
 */
export function computeReferenceRows(
  data: any[],
  valueColumn: string,
  params: OverlayParams,
  groupColumn?: string,
): ReferenceRows {
  const selected = new Set(params.refStats ?? []);
  const statList = STAT_ORDER.filter((s) => selected.has(s));
  const percentile = normalizePercentile(params.percentile);
  const showLabels = params.showLabels ?? true;

  const groups = new Map<any, any[]>();
  if (groupColumn) {
    for (const row of data) {
      const key = row?.[groupColumn];
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
  } else {
    groups.set(undefined, data);
  }

  let isTime = false;
  const stats: ReferenceLineRow[] = [];
  groups.forEach((groupRows, key) => {
    const numeric = numericValues(groupRows, valueColumn);
    isTime = isTime || numeric.isTime;
    if (numeric.values.length === 0) return;
    const sorted = numeric.values.sort((a, b) => a - b);

    for (const stat of statList) {
      const value = statValue(stat, sorted, percentile);
      const text = numeric.isTime ? formatDateTick(value) : formatNumericTick(value);
      stats.push({
        [VALUE_KEY]: numeric.isTime ? new Date(value) : value,
        [LABEL_KEY]: showLabels ? `${statLabel(stat, percentile)} ${text}` : '',
        ...(groupColumn ? { [groupColumn]: key } : {}),
      });
    }
  });

  // A typed-in number means nothing on a time axis, so it only applies to
  // numeric values.
  const fixed: ReferenceLineRow[] = [];
  const refValue = params.refValue;
  if (!isTime && typeof refValue === 'number' && Number.isFinite(refValue)) {
    fixed.push({
      [VALUE_KEY]: refValue,
      [LABEL_KEY]: showLabels ? formatNumericTick(refValue) : '',
    });
  }

  return { stats, fixed };
}

export function buildReferenceLines(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  orientation: 'x' | 'y',
  colorColumn?: string,
): Plot.Markish {
  const color = params.color ?? DEFAULT_OVERLAY_COLOR;
  const strokeWidth = params.strokeWidth ?? 1.5;
  const showLabels = params.showLabels ?? true;
  const groupColumn = params.perGroup && colorColumn ? colorColumn : undefined;
  const onY = orientation === 'y';

  const { stats, fixed } = computeReferenceRows(data, onY ? yCol : xCol, params, groupColumn);
  if (stats.length === 0 && fixed.length === 0) return [];

  const valueChannel = onY ? 'y' : 'x';
  // Reference lines summarise the whole cell (or a group), not one series.
  const className = `overlay-no-tooltip ${OVERLAY_NO_HIGHLIGHT_CLASS} ${REFERENCE_LINE_CLASS}`;
  const rule = (rows: ReferenceLineRow[], stroke: string) => {
    const options = {
      [valueChannel]: VALUE_KEY,
      stroke,
      strokeWidth,
      strokeDasharray: '4,3',
      // A fixed value outside a shared/fixed domain must not draw over the axes.
      clip: true,
      className,
    } as any;
    return onY ? Plot.ruleY(rows, options) : Plot.ruleX(rows, options);
  };

  const marks: Plot.Markish[] = [];
  // Grouped statistics take the chart's colour scale via the group column; the
  // fixed value always takes the overlay colour. They stay in separate marks
  // because one channel cannot mix a literal colour with scaled categories.
  if (stats.length > 0) marks.push(rule(stats, groupColumn ?? color));
  if (fixed.length > 0) marks.push(rule(fixed, color));

  if (showLabels) {
    // Horizontal rules: label above the line at the right edge.
    // Vertical rules: label beside the line at the top edge.
    const label = (rows: ReferenceLineRow[], fill: string) => Plot.text(rows, {
      [valueChannel]: VALUE_KEY,
      text: LABEL_KEY,
      fill,
      frameAnchor: onY ? 'right' : 'top',
      textAnchor: onY ? 'end' : 'start',
      lineAnchor: onY ? 'bottom' : 'top',
      dx: onY ? -4 : 4,
      dy: onY ? -2 : 2,
      fontSize: SERIES_LABEL_FONT_SIZE,
      fontWeight: 500,
      stroke: T.chartHalo,
      strokeWidth: 3,
      paintOrder: 'stroke',
      pointerEvents: 'none',
      clip: true,
      className: `${className} ${onY ? SERIES_END_LABEL_DODGE_Y_CLASS : SERIES_END_LABEL_DODGE_X_CLASS}`,
    } as any);

    // The renderer de-overlaps labels within one mark, so keep them together
    // where a single colour allows it.
    if (!groupColumn) {
      marks.push(label([...stats, ...fixed], color));
    } else {
      if (stats.length > 0) marks.push(label(stats, groupColumn));
      if (fixed.length > 0) marks.push(label(fixed, color));
    }
  }

  return marks;
}
