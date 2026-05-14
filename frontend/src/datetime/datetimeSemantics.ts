// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Central DateTime semantics used across SQL builders, ingestion, and charting.
 * Encapsulates parts/modes, UTC contract, ISO weekday rule, sub-second modulo guidance,
 * display formats, and derived alias naming.
 */
import { DateTimeMode, DateTimePart } from '../types';

// Supported parts and modes
export const DATETIME_PARTS: readonly DateTimePart[] = [
  'year',
  'month',
  'day',
  'weekday',
  'hour',
  'minute',
  'second',
  'millisecond',
  'microsecond',
  'nanosecond',
] as const;

export const DATETIME_MODES: readonly DateTimeMode[] = ['distinct', 'timeline'] as const;

// UTC contract and ISO weekday rule (Mon=1..Sun=7). Timeline weekday bins by day.
export const UTC_SEMANTICS_NOTE =
  'All datetime parts are interpreted and derived in UTC; weekday is ISO (Mon=1..Sun=7).';

// Derived column alias: <field>_<part>_<mode>
export function buildDateTimeAlias(field: string, part: DateTimePart, mode: DateTimeMode): string {
  return `${field}_${part}_${mode}`;
}

// date_trunc units for timeline mode (shared by backend/local SQL)
export const TIMELINE_UNITS: Record<DateTimePart, string> = {
  year: 'year',
  month: 'month',
  day: 'day',
  weekday: 'day', // weekday timeline bins at day resolution
  hour: 'hour',
  minute: 'minute',
  second: 'second',
  millisecond: 'millisecond',
  microsecond: 'microsecond',
  nanosecond: 'nanosecond',
};

// EXTRACT parts for distinct mode; weekday is normalized separately to ISO.
export const DISTINCT_EXTRACT_PART: Record<DateTimePart, string> = {
  year: 'YEAR',
  month: 'MONTH',
  day: 'DAY',
  weekday: 'DOW', // caller applies ISO normalization: ((dow + 6) % 7) + 1
  hour: 'HOUR',
  minute: 'MINUTE',
  second: 'SECOND',
  millisecond: 'MILLISECOND',
  microsecond: 'MICROSECOND',
  nanosecond: 'NANOSECOND',
};

// Sub-second parts need modulo to drop the seconds component in some engines.
export const SUBSECOND_MODULO: Partial<Record<DateTimePart, number>> = {
  millisecond: 1000,
  microsecond: 1000000,
  nanosecond: 1000000000,
};

export function getModuloForPart(part: DateTimePart): number | undefined {
  return SUBSECOND_MODULO[part];
}

export function isSubSecondPart(part: DateTimePart): boolean {
  return part === 'millisecond' || part === 'microsecond' || part === 'nanosecond';
}

export function getTimelineUnit(part: DateTimePart): string {
  return TIMELINE_UNITS[part];
}

export function getDistinctExtractPart(part: DateTimePart): string {
  return DISTINCT_EXTRACT_PART[part];
}

// Display formats by resolution (UTC-oriented, ISO-like).
export const DISPLAY_FORMAT_BY_PART: Record<DateTimePart, string> = {
  year: 'YYYY',
  month: 'YYYY-MM',
  day: 'YYYY-MM-DD',
  weekday: 'dddd', // consumer can map 1-7 to labels if desired
  hour: 'YYYY-MM-DD HH',
  minute: 'YYYY-MM-DD HH:mm',
  second: 'YYYY-MM-DD HH:mm:ss',
  millisecond: 'YYYY-MM-DD HH:mm:ss.SSS',
  microsecond: 'YYYY-MM-DD HH:mm:ss.SSSSSS',
  nanosecond: 'YYYY-MM-DD HH:mm:ss.SSSSSSSSS',
};

export function getDisplayFormat(part: DateTimePart): string {
  return DISPLAY_FORMAT_BY_PART[part];
}

export function isValidDateTimePart(part: string): part is DateTimePart {
  return (DATETIME_PARTS as readonly string[]).includes(part);
}

export function isValidDateTimeMode(mode: string): mode is DateTimeMode {
  return (DATETIME_MODES as readonly string[]).includes(mode);
}

// Warning hook text for future UTC enforcement (non-fatal).
export const UTC_WARNING_HINT =
  'Non-UTC datetimes detected; values will be interpreted as UTC for derived parts. Check source data/timezone.';
