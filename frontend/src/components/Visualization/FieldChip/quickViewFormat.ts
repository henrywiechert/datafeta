// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/** Number and value formatting shared by the Quick View panel and its charts. */

export const formatInteger = (value: number): string => value.toLocaleString();

export const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Number.isInteger(value)) return formatInteger(value);
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 0.001 || magnitude >= 1e9)) {
    return value.toExponential(2);
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

/** Compact axis label: 12.3k, 4.5M — keeps histogram ends readable at 240px wide. */
export const formatCompact = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude >= 1000 && magnitude < 1e15) {
    return value.toLocaleString(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
  }
  return formatNumber(value);
};

export const formatPercent = (part: number, total: number): string => {
  if (total <= 0) return '0%';
  const pct = (part / total) * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return `${pct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
};

export const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '(null)';
  if (value === '') return '(empty)';
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
};

/**
 * Shorten a bucket start for a time axis label.
 * Backends return 'YYYY-MM-DD HH:MM:SS' (or just the date); which part is
 * meaningful depends on the granularity the backend picked.
 */
export const formatBucketLabel = (start: string, bucket?: string | null): string => {
  if (bucket === 'year') return start.slice(0, 4);
  if (bucket === 'month') return start.slice(0, 7);
  if (bucket === 'hour') return start.slice(5, 16);
  return start.slice(0, 10);
};
