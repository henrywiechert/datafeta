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
  'week',
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

// UTC contract: ISO weekday (Mon=1..Sun=7); ISO week Monday-start, distinct 1–53.
export const UTC_SEMANTICS_NOTE =
  'All datetime parts are interpreted and derived in UTC; weekday is ISO (Mon=1..Sun=7); week is ISO Monday-start (distinct 1–53).';

// Derived column alias: <field>_<part>_<mode>
export function buildDateTimeAlias(field: string, part: DateTimePart, mode: DateTimeMode): string {
  return `${field}_${part}_${mode}`;
}

/* ------------------------------------------------------------------------- *
 * Resolution: the two rules, each stated exactly once.
 *
 *   1. Does datetime handling apply?   -> MODE is truthy.
 *      Mirrors backend field_term_resolver.py: `if not date_mode: return term`.
 *
 *   2. Is there a derived output column? -> PART is truthy.
 *      Mirrors backend select_builder.py: "Full DateTime" (mode but no part)
 *      keeps the plain field name; explicit parts get <field>_<part>_<mode>.
 *
 * A datetime column with no explicit mode behaves as 'timeline' ("Full
 * DateTime"). That default has been the query-path behaviour since the backend
 * gained flexible timestamp parsing — a text-stored datetime column is only
 * parsed into a real timestamp when a mode is present. Resolving it here keeps
 * the render path, the filter path and the menu in agreement with the SQL.
 *
 * Consequence: `(part: undefined, mode: undefined)` and
 * `(part: undefined, mode: 'timeline')` are the SAME state. There is
 * deliberately no migration collapsing them in stored data; this resolver is
 * the single place the default is applied.
 * ------------------------------------------------------------------------- */

/**
 * Anything that may describe a datetime column: a frontend `Field` (camelCase,
 * carries `dataType`), or a backend wire `Dimension`/`Filter` (snake_case, no
 * `dataType`).
 */
export interface DateTimeCarrier {
  dataType?: string;
  dateTimePart?: DateTimePart;
  dateTimeMode?: DateTimeMode;
  date_part?: DateTimePart;
  date_mode?: DateTimeMode;
}

export interface DateTimeResolution {
  /** Datetime handling applies at all. */
  isDateTime: boolean;
  /** The extracted part, if any. Absent for "Full DateTime". */
  part?: DateTimePart;
  /** Effective mode — defaults to 'timeline' for datetime carriers. */
  mode?: DateTimeMode;
  /** Datetime with no part: the whole timestamp. */
  isFullDateTime: boolean;
  /** Values arrive as real timestamps (Full DateTime or a timeline part). */
  isTemporalValue: boolean;
  /** Values arrive as small integers (hour 0-23, weekday 1-7, ...). */
  isDistinctPart: boolean;
  /** SELECT emits <field>_<part>_<mode> rather than the plain field name. */
  hasDerivedAlias: boolean;
}

const NOT_DATETIME: DateTimeResolution = {
  isDateTime: false,
  isFullDateTime: false,
  isTemporalValue: false,
  isDistinctPart: false,
  hasDerivedAlias: false,
};

/**
 * Resolve a carrier's effective datetime configuration, applying the
 * "no mode means timeline" default.
 */
export function resolveDateTime(
  carrier: DateTimeCarrier | null | undefined
): DateTimeResolution {
  if (!carrier) return NOT_DATETIME;

  const part = carrier.dateTimePart ?? carrier.date_part;
  const rawMode = carrier.dateTimeMode ?? carrier.date_mode;

  // A Field knows its dataType; a wire Dimension does not, but by the time it is
  // on the wire a datetime column always carries a mode. Accepting either signal
  // lets one function serve both shapes.
  const isDateTime = carrier.dataType === 'datetime' || Boolean(rawMode);
  if (!isDateTime) return NOT_DATETIME;

  const mode: DateTimeMode = rawMode ?? 'timeline';
  const isDistinctPart = Boolean(part) && mode === 'distinct';

  return {
    isDateTime: true,
    part,
    mode,
    isFullDateTime: !part,
    isTemporalValue: !isDistinctPart,
    isDistinctPart,
    hasDerivedAlias: Boolean(part),
  };
}

/** The wire payload for a Dimension / Filter. Empty for non-datetime carriers. */
export function toWireDateTime(
  carrier: DateTimeCarrier | null | undefined
): { date_part?: DateTimePart; date_mode?: DateTimeMode } {
  const r = resolveDateTime(carrier);
  if (!r.isDateTime) return {};
  return { date_part: r.part, date_mode: r.mode };
}

/**
 * The output column name a field resolves to in query results.
 * Part-only by rule 2: "Full DateTime" keeps the plain field name.
 */
export function dateTimeOutputName(columnName: string, r: DateTimeResolution): string {
  return r.hasDerivedAlias ? buildDateTimeAlias(columnName, r.part!, r.mode!) : columnName;
}

// date_trunc units for timeline mode (shared by backend/local SQL)
export const TIMELINE_UNITS: Record<DateTimePart, string> = {
  year: 'year',
  month: 'month',
  week: 'week',
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
  week: 'WEEK',
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
  week: 'YYYY-[W]WW',
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
