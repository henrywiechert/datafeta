// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Date/time conversion utilities for ChartArea
 *
 * Pure functions that convert between epoch-like numeric values, Date objects,
 * and integer "parts" (year, month, day, etc.) used by the backend extraction
 * functions (e.g. ClickHouse `toDayOfMonth`).
 */

import type { DateTimePart } from '../../../../types';

/** Convert an epoch-like number to a Date using magnitude heuristics (s/ms/µs/ns). */
export function epochToDate(num: number): Date | null {
  if (!Number.isFinite(num)) return null;
  const abs = Math.abs(num);
  let ms: number;
  if (abs >= 1e18)      ms = num / 1_000_000;   // nanoseconds
  else if (abs >= 1e15) ms = num / 1000;         // microseconds
  else if (abs >= 1e12) ms = num;                // milliseconds
  else                  ms = num * 1000;         // seconds
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Convert a value (potentially a Date, epoch number, BigInt, or ISO string)
 * to the integer that the backend's DISTINCT extraction function expects
 * (e.g. toDayOfMonth → 14).
 *
 * Returns the value unchanged when no conversion is applicable.
 */
export function toDatePartInteger(val: any, part: DateTimePart): any {
  // Already a small integer from distinct mode (e.g. day 1-31, hour 0-23)
  if (typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 9999) {
    return val;
  }

  // Convert to Date using the same epoch heuristic as normalizeTimelineData
  let d: Date | null = null;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'bigint') {
    const num = Number(val);
    if (Number.isFinite(num)) d = epochToDate(num);
  } else if (typeof val === 'number' && Number.isFinite(val)) {
    d = epochToDate(val);
  } else if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) d = new Date(parsed);
  }

  if (!d || isNaN(d.getTime())) return val;

  switch (part) {
    case 'year': return d.getUTCFullYear();
    case 'month': return d.getUTCMonth() + 1;        // 1-12
    case 'day': return d.getUTCDate();                // 1-31
    case 'weekday': {
      // ISO weekday: Mon=1 … Sun=7 (matches ClickHouse toDayOfWeek)
      const jsDay = d.getUTCDay(); // 0=Sun
      return jsDay === 0 ? 7 : jsDay;
    }
    case 'hour': return d.getUTCHours();
    case 'minute': return d.getUTCMinutes();
    case 'second': return d.getUTCSeconds();
    case 'millisecond': return d.getUTCMilliseconds();
    default: return val;
  }
}
