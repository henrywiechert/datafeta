// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Date formatting utilities for Observable Plot axes.
 * Provides concise, readable date labels instead of verbose Date.toString() output.
 */

import { formatDateTimeDisplay } from '../../datetime/datetimeDisplayFormat';

/**
 * Format a date for axis tick labels.
 * Produces a concise UTC ISO-like format: "YYYY-MM-DD" at midnight, otherwise
 * "YYYY-MM-DD HH:mm:ss". Seconds are always shown for consistency, since these
 * values may also serve as filter keys sent to the backend.
 */
export function formatDateTick(date: Date | number | string): string {
  if (date === null || date === undefined) return '';
  return formatDateTimeDisplay(date, { collapseMidnight: true }) ?? String(date);
}

const DAY_MS = 86_400_000;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function toTickDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value as any);
  return Number.isFinite(d.getTime()) ? d : null;
}

function utcDay(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

type TickPrecision = 'year' | 'month' | 'day' | 'minute' | 'second' | 'millisecond';

/** The coarsest unit that still tells every tick apart (ticks sit on nice boundaries). */
function tickPrecision(ticks: Date[]): TickPrecision {
  if (ticks.some((d) => d.getUTCMilliseconds() !== 0)) return 'millisecond';
  if (ticks.some((d) => d.getUTCSeconds() !== 0)) return 'second';
  if (ticks.some((d) => d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0)) return 'minute';
  if (ticks.some((d) => d.getUTCDate() !== 1)) return 'day';
  if (ticks.some((d) => d.getUTCMonth() !== 0)) return 'month';
  return 'year';
}

function formatTimeOfDay(d: Date, precision: TickPrecision): string {
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (precision === 'minute') return hm;
  const hms = `${hm}:${pad(d.getUTCSeconds())}`;
  return precision === 'second' ? hms : `${hms}.${pad(d.getUTCMilliseconds(), 3)}`;
}

/**
 * Tick formatter for continuous time axes (Observable Plot calls it with
 * `(value, index, ticks)`).
 *
 * Unlike `formatDateTick`, which always prints the full timestamp, this sizes the
 * label to the tick step so a 5-minute span reads "12:27:30" rather than a row of
 * overlapping "2026-01-16 12:27:30". Intra-day ticks show the time only, with the
 * date on a second line at the first tick and wherever the day changes. Longer
 * spans collapse to "YYYY-MM-DD", "YYYY-MM" or "YYYY".
 */
export function formatDateAxisTick(value: unknown, index?: number, ticks?: ArrayLike<unknown>): string {
  const d = toTickDate(value);
  if (!d) return value === null || value === undefined ? '' : String(value);

  const tickDates = ticks ? Array.from(ticks, toTickDate).filter((t): t is Date => t !== null) : [];
  if (tickDates.length < 2) return formatDateTick(d);

  const precision = tickPrecision(tickDates);
  if (precision === 'year') return String(d.getUTCFullYear());
  if (precision === 'month') return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  if (precision === 'day') return utcDay(d);

  const time = formatTimeOfDay(d, precision);
  const i = index ?? 0;
  const prev = i > 0 ? toTickDate(ticks![i - 1]) : null;
  const showDate = !prev || Math.floor(prev.getTime() / DAY_MS) !== Math.floor(d.getTime() / DAY_MS);
  return showDate ? `${time}\n${utcDay(d)}` : time;
}

