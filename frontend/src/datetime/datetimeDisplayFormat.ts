// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared datetime DISPLAY formatter.
 *
 * Single source of truth for turning datetime-ish values (epoch numbers,
 * bigints, Date instances, ISO-like strings) into human-readable, ISO-8601
 * strings for the UI (tooltips, axis ticks, table cells).
 *
 * Display plane only: output MUST NOT be fed back into SQL, grouping, cache,
 * or filter keys. Defaults to UTC so it stays consistent with axis/table
 * rendering and never shifts values by the viewer's timezone.
 */

export type DisplayTimeZone = 'UTC' | 'local';
export type DisplayPrecision = 'second' | 'ms' | 'us';

export interface DateTimeDisplayOptions {
  /** Timezone used to render components. Defaults to 'UTC'. */
  timeZone?: DisplayTimeZone;
  /** Sub-second precision shown after the seconds. Defaults to 'second'. */
  precision?: DisplayPrecision;
  /** When true, values exactly at midnight render as date-only (used by axis ticks). */
  collapseMidnight?: boolean;
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}

/**
 * Detect the epoch unit from magnitude and return the milliseconds (for Date
 * construction) plus the microsecond fraction of the second (0-999999).
 * Handles seconds, milliseconds, microseconds, and nanoseconds.
 */
export function epochToComponents(num: number): { ms: number; microsFraction: number } | null {
  if (!Number.isFinite(num)) return null;
  const abs = Math.abs(num);
  let ms: number;
  let microsFraction: number;
  if (abs >= 1e18) {
    ms = num / 1_000_000;
    microsFraction = Math.abs(Math.trunc(num / 1000) % 1_000_000);
  } else if (abs >= 1e15) {
    ms = num / 1000;
    microsFraction = Math.abs(Math.trunc(num) % 1_000_000);
  } else if (abs >= 1e12) {
    // milliseconds — may carry sub-ms precision as a fractional part
    // (apache-arrow returns epoch-ms floats like 1762955629225.794 for µs data)
    ms = num;
    const msInSecond = Math.abs(Math.trunc(num) % 1000);
    const subMsFraction = Math.abs(num) % 1;
    microsFraction = msInSecond * 1000 + Math.round(subMsFraction * 1000);
  } else {
    ms = num * 1000;
    microsFraction = 0;
  }
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? { ms, microsFraction } : null;
}

export function epochToDate(num: number): Date | null {
  const c = epochToComponents(num);
  return c ? new Date(c.ms) : null;
}

/**
 * Resolve a raw value to a Date plus its microsecond fraction of the second.
 * Numbers/bigints use magnitude-based epoch heuristics; Date/string keep their
 * native millisecond resolution (fraction = ms * 1000).
 */
function resolveDateAndMicros(value: unknown): { date: Date; microsFraction: number } | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number' || typeof value === 'bigint') {
    const num = Number(value);
    const comps = epochToComponents(num);
    if (!comps) return null;
    return { date: new Date(comps.ms), microsFraction: comps.microsFraction };
  }

  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }

  if (!date || !Number.isFinite(date.getTime())) return null;
  // Date only carries millisecond resolution; scale to a microsecond fraction.
  return { date, microsFraction: date.getUTCMilliseconds() * 1000 };
}

interface Components {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function extractComponents(date: Date, timeZone: DisplayTimeZone): Components {
  if (timeZone === 'local') {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hours: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds(),
    };
  }
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
    seconds: date.getUTCSeconds(),
  };
}

/**
 * Format a datetime-ish value for display. Returns `null` when the value cannot
 * be interpreted as a date, so callers can fall back to their own rendering.
 */
export function formatDateTimeDisplay(
  value: unknown,
  options: DateTimeDisplayOptions = {},
): string | null {
  const { timeZone = 'UTC', precision = 'second', collapseMidnight = false } = options;

  const resolved = resolveDateAndMicros(value);
  if (!resolved) return null;

  const { date, microsFraction } = resolved;
  const c = extractComponents(date, timeZone);

  const datePart = `${c.year}-${pad(c.month, 2)}-${pad(c.day, 2)}`;

  if (collapseMidnight && c.hours === 0 && c.minutes === 0 && c.seconds === 0) {
    return datePart;
  }

  let out = `${datePart} ${pad(c.hours, 2)}:${pad(c.minutes, 2)}:${pad(c.seconds, 2)}`;

  if (precision === 'ms') {
    out += `.${pad(Math.floor(microsFraction / 1000), 3)}`;
  } else if (precision === 'us') {
    out += `.${pad(microsFraction, 6)}`;
  }

  return out;
}
