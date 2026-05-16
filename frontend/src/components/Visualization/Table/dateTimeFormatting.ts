// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared datetime formatting utilities for table views.
 *
 * Handles epoch-based timestamp values (seconds, milliseconds, microseconds,
 * nanoseconds) using magnitude heuristics, and provides high-precision
 * formatting with real microsecond digits for DateTime64 / Timestamp columns.
 *
 * All output uses ISO 8601 format: YYYY-MM-DD HH:mm:ss[.ffffff]
 */

import { mapBackendDataType } from '../../../utils/fieldUtils';

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}

/** Format a Date as ISO `YYYY-MM-DD HH:mm:ss` (second precision, UTC). */
function toIsoString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ` +
    `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}`;
}

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

/** Format an epoch number as ISO with 6-digit microsecond fraction. */
export function formatEpochHighPrecision(num: number): string | null {
  const c = epochToComponents(num);
  if (!c) return null;
  const d = new Date(c.ms);
  if (!Number.isFinite(d.getTime())) return null;
  const frac = c.microsFraction.toString().padStart(6, '0');
  return `${toIsoString(d)}.${frac}`;
}

/** Format a Date as ISO, optionally with 6-digit microsecond fraction. */
export function formatDate(d: Date, highPrecision: boolean): string {
  if (!highPrecision) return toIsoString(d);
  const ms = d.getUTCMilliseconds().toString().padStart(3, '0');
  return `${toIsoString(d)}.${ms}000`;
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
 * Build a datetime-column map from field objects (Field[]).
 * Useful when query result columns have type: 'unknown' (local DuckDB execution).
 * Fields carry `dataType: 'datetime'` which is the classification we need.
 */
export function buildDatetimeMapFromFields(fields: any[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const f of fields) {
    if (f.dataType === 'datetime') {
      map.set(f.columnName, true);
    }
  }
  return map;
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
    if (d) return toIsoString(d);
  }
  if (value instanceof Date) return formatDate(value, highPrecision);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return formatDate(parsed, highPrecision);
  }
  return null;
}
