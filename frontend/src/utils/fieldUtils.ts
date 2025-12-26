import { Field, Aggregation } from '../types';
import { 
  getResultColumnNameForDateTime,
  getFieldDisplayNameWithDateTime,
  getDateTimePartTooltip as getDateTimeTooltip 
} from './datetimeUtils';

const DISCRETE_AGGREGATIONS: Aggregation[] = ['min', 'max', 'count', 'count_distinct'];

/**
 * Convert an epoch-like value to a JS Date.
 * Handles seconds, milliseconds, microseconds, and nanoseconds via magnitude heuristics.
 */
function epochToDate(value: any): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;

  let num: number;
  if (typeof value === 'bigint') {
    // Convert BigInt to number; may lose precision for huge values but ms epoch fits fine.
    num = Number(value);
  } else if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    // If it parses as ISO date string, use that
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed);
    // Otherwise try as numeric
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    num = n;
  } else {
    return null;
  }

  if (!Number.isFinite(num)) return null;

  // Heuristic by magnitude to determine unit:
  // ns ~ 1e18, us ~ 1e15, ms ~ 1e12, s ~ 1e9
  const abs = Math.abs(num);
  let ms: number;
  if (abs >= 1e18) {
    ms = num / 1_000_000; // nanoseconds
  } else if (abs >= 1e15) {
    ms = num / 1000; // microseconds
  } else if (abs >= 1e12) {
    ms = num; // milliseconds
  } else {
    ms = num * 1000; // seconds
  }

  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Check if a field is in timeline mode (not distinct mode).
 * Handles both camelCase (dateTimeMode) and snake_case (date_mode) property names.
 */
function isTimelineField(f: Field): boolean {
  // camelCase (frontend Field type)
  if (f.dateTimeMode === 'timeline') return true;
  // snake_case (backend Dimension/Measure type)
  if ((f as any).date_mode === 'timeline') return true;
  return false;
}

/**
 * Build the column name for a field, handling both property naming conventions.
 */
function getFieldColumnName(f: Field): string {
  const datePart = f.dateTimePart || (f as any).date_part;
  const dateMode = f.dateTimeMode || (f as any).date_mode;
  if (datePart && dateMode) {
    return `${f.columnName}_${datePart}_${dateMode}`;
  }
  return getResultColumnName(f);
}

/**
 * Identify timeline fields and convert their epoch values to Date objects.
 * This ensures Observable Plot uses time scales and displays readable dates.
 *
 * Only affects fields with dateTimeMode/date_mode === 'timeline' (not 'distinct').
 * Distinct mode fields (hour 0-23, month 1-12, etc.) are left as integers.
 *
 * @param rows - Data rows from query result
 * @param fields - All fields (dimensions, measures, color, size, etc.)
 * @returns New rows array with timeline columns converted to Date
 */
export function normalizeTimelineData(rows: any[], fields: Field[]): any[] {
  if (!rows || rows.length === 0 || !fields || fields.length === 0) {
    return rows;
  }

  // Find all timeline columns (both continuous and discrete)
  const timelineColumns: string[] = [];
  for (const f of fields) {
    if (isTimelineField(f)) {
      const colName = getFieldColumnName(f);
      if (!timelineColumns.includes(colName)) {
        timelineColumns.push(colName);
      }
    }
  }

  if (timelineColumns.length === 0) {
    return rows; // No transformation needed
  }

  // Transform rows: convert epoch → Date for timeline columns
  return rows.map((row) => {
    const newRow = { ...row };
    for (const col of timelineColumns) {
      const val = newRow[col];
      if (val !== null && val !== undefined && !(val instanceof Date)) {
        const d = epochToDate(val);
        if (d !== null) {
          newRow[col] = d;
        }
      }
    }
    return newRow;
  });
}
const CONTINUOUS_AGGREGATIONS: Aggregation[] = ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'];

/**
 * Gets the list of valid aggregations for a given field based on its rules.
 * @param field The field to check.
 * @returns An array of valid aggregation types.
 */
export function getAvailableAggregations(field: Field): Aggregation[] {
  if (field.type === 'dimension') {
    return []; // Dimensions have no aggregations
  }

  // For measures, available aggregations depend on flavour and data type
  if (field.flavour === 'discrete') {
    // Numerical discrete measures can have continuous aggregations
    if (field.dataType === 'integer' || field.dataType === 'float') {
      return CONTINUOUS_AGGREGATIONS;
    }
    // Non-numerical discrete measures have limited aggregations
    return DISCRETE_AGGREGATIONS;
  }

  return CONTINUOUS_AGGREGATIONS;
}

export function isDimension(field: Field): boolean {
  return field.type === 'dimension';
}

export function isMeasure(field: Field): boolean {
  return field.type === 'measure';
}

/**
 * Gets the column name for a field as it would appear in a query result.
 * Dimensions use their column name directly, while measures use an alias.
 * DateTime parts get a special alias: fieldname_part_mode
 * @param field The field.
 * @returns The name to look for in the query result columns.
 */
export function getResultColumnName(field: Field): string {
  return getResultColumnNameForDateTime(field);
}

/**
 * Gets the display name for a field, including datetime part information if present.
 * @param field The field.
 * @returns A formatted display name.
 */
export function getFieldDisplayName(field: Field): string {
  return getFieldDisplayNameWithDateTime(field);
}

/**
 * Gets a tooltip description for a field's datetime part configuration.
 * @param field The field.
 * @returns A description string, or undefined if no datetime part.
 */
export function getDateTimePartTooltip(field: Field): string | undefined {
  return getDateTimeTooltip(field);
} 