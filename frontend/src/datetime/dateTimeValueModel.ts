// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Typed DateTime value helpers to distinguish timeline vs categorical usage
 * and normalize values for band scales without heuristics scattered elsewhere.
 */
import { formatDateTick } from '../observable-plot-generator/utils/dateFormatUtils';

const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/;

type NormalizeArgs = {
  domain?: any[];
  rows?: any[];
  categoryColumn?: string;
};

type NormalizeResult = {
  domain?: any[];
  rows: any[];
  tickFormat?: (d: any) => string;
  hasDateLike: boolean;
};

function isDateLike(value: any): boolean {
  if (value instanceof Date) return true;
  if (typeof value === 'string' && ISO_DATE_TIME_RE.test(value)) {
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
  }
  return false;
}

function toDate(value: any): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toBandLabel(value: any): any {
  if (!isDateLike(value)) return value;
  const d = toDate(value);
  return d ? formatDateTick(d) : value;
}

/**
 * Normalize Date/ISO-like values for band scales. Returns normalized domain and rows
 * (copying rows only when needed) plus a tick formatter when date-like values exist.
 */
export function normalizeDateTimeForBand(args: NormalizeArgs): NormalizeResult {
  const { domain, rows = [], categoryColumn } = args;
  const hasDateDomain = Array.isArray(domain) && domain.some(isDateLike);
  const hasDateRows = Boolean(categoryColumn) && rows.some((r) => isDateLike(r?.[categoryColumn!]));
  const hasDateLike = Boolean(hasDateDomain || hasDateRows);

  const normalizedDomain = hasDateDomain && domain ? domain.map(toBandLabel) : domain;

  let normalizedRows = rows;
  if (hasDateRows && categoryColumn) {
    normalizedRows = rows.map((row) => {
      const val = row?.[categoryColumn];
      if (!isDateLike(val)) return row;
      return { ...row, [categoryColumn]: toBandLabel(val) };
    });
  }

  const tickFormat = hasDateLike ? (v: any) => toBandLabel(v) : undefined;

  return {
    domain: normalizedDomain,
    rows: normalizedRows,
    tickFormat,
    hasDateLike,
  };
}

export { isDateLike as isDateLikeValue };
