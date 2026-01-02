/**
 * Date formatting utilities for Observable Plot axes.
 * Provides concise, readable date labels instead of verbose Date.toString() output.
 */

/**
 * Format a date for axis tick labels.
 * Produces a concise ISO-like format: "YYYY-MM-DD HH:mm" or shorter depending on resolution.
 */
export function formatDateTick(date: Date | number | string): string {
  if (date === null || date === undefined) return '';
  
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return String(date);

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();

  // If time is exactly midnight, just show date
  if (hours === 0 && minutes === 0 && seconds === 0) {
    return `${year}-${month}-${day}`;
  }

  // Show date and time
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  
  // If seconds are non-zero, include them
  if (seconds !== 0) {
    const ss = String(seconds).padStart(2, '0');
    return `${year}-${month}-${day} ${hh}:${mm}:${ss}`;
  }

  return `${year}-${month}-${day} ${hh}:${mm}`;
}

/**
 * Create a tick formatter function for date axes.
 * Returns a function suitable for Observable Plot's tickFormat option.
 */
export function createDateTickFormatter(): (d: any) => string {
  return (d: any) => formatDateTick(d);
}

/**
 * Normalize a category value for use in Observable Plot band scales.
 * Converts Date objects to formatted strings to ensure consistent matching
 * between domain values and data values.
 * 
 * Observable Plot band scales don't handle Date objects correctly - they
 * stringify them inconsistently, causing mismatches between domain and data.
 * This function ensures both use the same string representation.
 */
export function normalizeCategoryValue(value: any): any {
  if (value instanceof Date) {
    return formatDateTick(value);
  }
  return value;
}

/**
 * Check if values look like Date objects or parseable date strings.
 */
function looksLikeDateValue(value: any): boolean {
  if (value instanceof Date) return true;
  // Also check for ISO date strings that came from timestamp columns
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return !isNaN(new Date(value).getTime());
  }
  return false;
}

/**
 * Normalize an array of category values for band scale domains.
 * Converts any Date objects (or ISO date strings) to formatted strings.
 */
export function normalizeCategoryDomain(categories: any[]): any[] {
  if (!categories || categories.length === 0) return categories;
  
  // Check if any categories are Dates or date-like strings
  const hasDateCategories = categories.some(looksLikeDateValue);
  if (!hasDateCategories) return categories;
  
  return categories.map(v => {
    if (v instanceof Date) {
      return formatDateTick(v);
    }
    // Also normalize ISO date strings to consistent short format
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        return formatDateTick(d);
      }
    }
    return v;
  });
}

/**
 * Normalize data rows by converting Date values in the specified column to strings.
 * This ensures the data matches the normalized category domain.
 * 
 * @param rows - Data rows to normalize
 * @param categoryColumn - Column name containing category values to normalize
 * @returns New array of rows with normalized category values (original rows unchanged)
 */
export function normalizeDataForBandScale(
  rows: any[],
  categoryColumn: string | undefined
): any[] {
  if (!categoryColumn || !rows || rows.length === 0) return rows;
  
  // Check if any values in the category column are Dates or date-like strings
  const hasDateValues = rows.some(row => {
    const val = row[categoryColumn];
    if (val instanceof Date) return true;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
      return !isNaN(new Date(val).getTime());
    }
    return false;
  });
  if (!hasDateValues) return rows;
  
  // Create new rows with normalized category values
  return rows.map(row => {
    const val = row[categoryColumn];
    if (val instanceof Date) {
      return { ...row, [categoryColumn]: formatDateTick(val) };
    }
    // Also normalize ISO date strings
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return { ...row, [categoryColumn]: formatDateTick(d) };
      }
    }
    return row;
  });
}
