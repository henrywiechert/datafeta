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

