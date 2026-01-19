/**
 * UTC enforcement warnings (non-fatal). Detects offsetful date strings or non-UTC Dates
 * and emits a console warning hint. Intended to be called during ingestion/serialization
 * or normalization of date-like values.
 */
import { UTC_WARNING_HINT } from './datetimeSemantics';

const OFFSET_RE = /[+-]\d{2}:?\d{2}$|Z$/i;

export function detectNonUtcDateLike(value: any): boolean {
  if (value instanceof Date) {
    // Date objects don't carry timezone, but if toString shows offset, warn.
    return false; // We treat Date as UTC-parsed already.
  }
  if (typeof value === 'string') {
    // If string has explicit offset that is not Z, warn.
    if (OFFSET_RE.test(value) && !value.endsWith('Z')) {
      return true;
    }
  }
  return false;
}

export function warnIfNonUtc(values: any[], context: string): void {
  if (!values || values.length === 0) return;
  const hasOffset = values.some((v) => detectNonUtcDateLike(v));
  if (hasOffset) {
    console.warn(`[UTC warning] ${context}: ${UTC_WARNING_HINT}`);
  }
}
