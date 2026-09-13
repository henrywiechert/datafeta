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

const DURATION_UNITS: Array<[string, number]> = [
  ['year', 365.2425 * 86400],
  ['month', 30.436875 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['min', 60],
  ['sec', 1],
];

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 || unit === 'min' || unit === 'sec' ? '' : 's'}`;

/** Coarse human duration, e.g. '2 years 8 months' or '14 days 6 hours'. */
export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  if (seconds < 1) return '< 1 sec';

  let remaining = seconds;
  const parts: string[] = [];
  for (const [unit, size] of DURATION_UNITS) {
    const count = Math.floor(remaining / size);
    if (count > 0) {
      parts.push(plural(count, unit));
      remaining -= count * size;
    }
    // Two units is enough to convey scale; more just adds noise.
    if (parts.length === 2) break;
  }
  return parts.join(' ');
};

/** Engines return 'YYYY-MM-DD HH:MM:SS', which Safari will not parse as-is. */
export const parseTimestamp = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value.trim().replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** How long ago a timestamp was, e.g. '3 days ago'. */
export const formatRelative = (value: string | null | undefined): string => {
  const parsed = parseTimestamp(value);
  if (!parsed) return '—';
  const deltaSeconds = (Date.now() - parsed.getTime()) / 1000;
  if (deltaSeconds < 0) return `in ${formatDuration(-deltaSeconds)}`;
  if (deltaSeconds < 60) return 'just now';
  return `${formatDuration(deltaSeconds)} ago`;
};
