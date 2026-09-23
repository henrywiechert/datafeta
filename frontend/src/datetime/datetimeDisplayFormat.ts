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
export type DisplayPrecision = 'second' | 'ms' | 'us' | 'auto';

export interface DateTimeDisplayOptions {
  /** Timezone used to render components. Defaults to 'UTC'. */
  timeZone?: DisplayTimeZone;
  /**
   * Sub-second precision shown after the seconds. Defaults to 'second'.
   * 'auto' shows only the precision the value actually carries, so whole-second
   * values stay unchanged and a µs value is not padded with fabricated zeros.
   */
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

/**
 * Slot carrying the sub-millisecond fraction alongside a Date.
 *
 * A JS Date only holds millisecond resolution, but our sources (ClickHouse
 * DateTime64(6), Timestamp(p), epoch-µs/ns columns) carry more. Rather than
 * change the row schema for a display-only concern, we hang the fraction off
 * the Date itself in a NON-ENUMERABLE slot, so it is invisible to `{...row}`
 * spreads, `Object.keys`, `JSON.stringify`, memo comparators and cache hashes.
 *
 * The annotation is lost if the Date is reconstructed (e.g. by an Observable
 * Plot bin/interval transform). Callers then degrade to millisecond precision,
 * which is the right answer for a binned value anyway.
 */
const MICROS_FRACTION = '__microsFraction';

/** Read the sub-millisecond fraction carried by `epochToPreciseDate`, if any. */
export function readMicrosFraction(d: Date): number | undefined {
  const v = (d as any)[MICROS_FRACTION];
  return typeof v === 'number' ? v : undefined;
}

/**
 * Epoch -> Date, carrying the microsecond fraction of the second so display
 * formatters can recover precision a Date cannot hold. See MICROS_FRACTION.
 */
export function epochToPreciseDate(num: number): Date | null {
  const c = epochToComponents(num);
  if (!c) return null;
  const d = new Date(c.ms);
  Object.defineProperty(d, MICROS_FRACTION, {
    value: c.microsFraction,
    enumerable: false,
    writable: false,
    configurable: true,
  });
  return d;
}

export function epochToDate(num: number): Date | null {
  return epochToPreciseDate(num);
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
  // Prefer a fraction carried over from the original epoch value; a bare Date
  // only holds millisecond resolution, so scale that up as the fallback.
  const carried = readMicrosFraction(date);
  return {
    date,
    microsFraction: carried ?? date.getUTCMilliseconds() * 1000,
  };
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

/** Narrowest precision that still shows everything the value carries. */
function autoPrecision(microsFraction: number): DisplayPrecision {
  if (microsFraction % 1000 !== 0) return 'us';
  if (microsFraction !== 0) return 'ms';
  return 'second';
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

  const effective = precision === 'auto' ? autoPrecision(microsFraction) : precision;

  if (effective === 'ms') {
    out += `.${pad(Math.floor(microsFraction / 1000), 3)}`;
  } else if (effective === 'us') {
    out += `.${pad(microsFraction, 6)}`;
  }

  return out;
}
