// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Datetime formatting helpers for table views.
 *
 * Thin wrappers over the shared display formatter (`datetimeDisplayFormat`),
 * plus table-specific column-type classification. All output uses ISO 8601
 * format: YYYY-MM-DD HH:mm:ss[.ffffff] (UTC).
 */

import { mapBackendDataType } from '../../../utils/fieldUtils';
import { formatDateTimeDisplay, epochToComponents, epochToDate } from '../../../datetime/datetimeDisplayFormat';

// Re-exported for existing consumers of the table module's epoch helpers.
export { epochToComponents, epochToDate };

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
  return formatDateTimeDisplay(value, { precision: highPrecision ? 'us' : 'second' });
}
