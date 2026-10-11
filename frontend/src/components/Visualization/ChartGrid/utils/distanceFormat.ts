// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Format the distance between two values on a chart axis, matching the
 * underlying field's semantics rather than always showing a raw number.
 * Used by pointer-driven span measurement (e.g. Gantt ruler) to label the
 * computed delta the same way the rest of the app already describes it.
 */
import { Field } from '../../../../types';
import { formatDuration, formatNumber } from '../../FieldChip/quickViewFormat';

const UNIT_LABELS: Record<string, string> = {
  year: 'year',
  month: 'month',
  week: 'week',
  day: 'day',
  weekday: 'weekday',
  hour: 'hour',
  minute: 'minute',
  second: 'second',
  millisecond: 'millisecond',
  microsecond: 'microsecond',
  nanosecond: 'nanosecond',
};

function pluralizeUnit(count: number, unit: string): string {
  const n = Math.round(count);
  return `${n} ${unit}${Math.abs(n) === 1 ? '' : 's'}`;
}

/**
 * Format `diff` (the difference between two raw axis values) for display.
 *
 * - Distinct-mode datetime fields (dateTimePart set, e.g. "month") count in
 *   that unit directly — the raw values are already integer parts, not epoch ms.
 * - Timeline datetime fields carry epoch-millisecond values — rendered via
 *   the existing coarse human-duration formatter.
 * - Plain numeric fields fall back to locale number formatting.
 */
export function formatFieldDistance(field: Field | undefined, diff: number): string {
  if (!Number.isFinite(diff)) return '—';

  if (field?.dataType === 'datetime') {
    if (field.dateTimeMode === 'distinct' && field.dateTimePart) {
      return pluralizeUnit(diff, UNIT_LABELS[field.dateTimePart] ?? field.dateTimePart);
    }
    return formatDuration(Math.abs(diff) / 1000);
  }

  return formatNumber(Math.abs(diff));
}
