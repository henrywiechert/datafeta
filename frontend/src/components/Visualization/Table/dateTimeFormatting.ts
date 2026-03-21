/**
 * Shared datetime formatting utilities for table views.
 *
 * Handles epoch-based timestamp values (seconds, milliseconds, microseconds,
 * nanoseconds) using magnitude heuristics, and provides high-precision
 * formatting with real microsecond digits for DateTime64 / Timestamp columns.
 */

import { mapBackendDataType } from '../../../utils/fieldUtils';

/**
 * Detect the epoch unit from magnitude and return { ms (for Date), microsFraction (0–999999) }.
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

export function formatEpochHighPrecision(num: number): string | null {
  const c = epochToComponents(num);
  if (!c) return null;
  const d = new Date(c.ms);
  if (!Number.isFinite(d.getTime())) return null;
  const frac = c.microsFraction.toString().padStart(6, '0');
  return `${d.toLocaleString()}.${frac}`;
}

export function formatDate(d: Date, highPrecision: boolean): string {
  if (!highPrecision) return d.toLocaleString();
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${d.toLocaleString()}.${ms}000`;
}

/** True when the backend column type has sub-second precision (DateTime64, Timestamp(p), etc.). */
export function isHighPrecisionDatetime(colType: string): boolean {
  const lower = colType.toLowerCase();
  return lower.includes('datetime64') || lower.includes('timestamp');
}

/** True when the backend column type maps to 'datetime'. */
export function isDatetimeType(colType: string): boolean {
  return mapBackendDataType(colType) === 'datetime';
}

/**
 * Format a cell value for a datetime column.
 * Handles number, bigint, Date, and string values.
 * Returns null if the value cannot be formatted as a date.
 */
export function formatDatetimeValue(value: any, highPrecision: boolean): string | null {
  if (value === null || value === undefined) return '';
  if (typeof value === 'bigint' || typeof value === 'number') {
    if (highPrecision) {
      const s = formatEpochHighPrecision(Number(value));
      if (s) return s;
    }
    const d = epochToDate(Number(value));
    if (d) return d.toLocaleString();
  }
  if (value instanceof Date) return formatDate(value, highPrecision);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return formatDate(parsed, highPrecision);
  }
  return null;
}
