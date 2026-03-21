/**
 * DateTime Formatting Utilities
 * 
 * Utilities for parsing and formatting datetime strings with millisecond precision.
 * Supports ISO 8601 format with milliseconds: "2024-01-15T14:30:00.123Z"
 */

/**
 * Parse datetime string into components
 */
export interface DateTimeComponents {
  date: string;        // "2024-01-15"
  time: string;        // "14:30:00"
  milliseconds: string; // "123"
}

/**
 * Parse datetime string with milliseconds (no timezone conversion)
 * 
 * Supports both ISO 8601 and database formats:
 * - "2024-01-15T14:30:00.123Z" (ISO 8601)
 * - "2024-01-15 14:30:00.123" (Database format)
 * 
 * Note: This function does NOT perform timezone conversion. 
 * Use parseUTCToLocal() if you need to convert UTC to local timezone.
 * 
 * @param dateTimeString Datetime string
 * @returns Components object or null if invalid
 */
export function parseISODateTime(dateTimeString: string | null): DateTimeComponents | null {
  if (!dateTimeString) return null;

  try {
    // Remove timezone indicator if present
    let normalized = dateTimeString.replace('Z', '').replace(/[+-]\d{2}:\d{2}$/, '');
    
    // Split by 'T' or space to get date and time parts
    const [datePart, timePart] = normalized.includes('T') 
      ? normalized.split('T')
      : normalized.split(' ');
    
    if (!datePart || !timePart) return null;
    
    // Split time part by '.' to get time and milliseconds
    const [time, ms] = timePart.split('.');
    
    return {
      date: datePart,
      time: time || '00:00:00',
      milliseconds: ms ? ms.padEnd(3, '0').substring(0, 3) : '000',
    };
  } catch (error) {
    console.error('Error parsing datetime:', error);
    return null;
  }
}

/**
 * Parse UTC datetime string and convert to local timezone
 * 
 * Takes a datetime string assumed to be in UTC and converts it to the browser's local timezone.
 * This is useful for displaying database datetime values (which are typically UTC) to users.
 * 
 * @param utcDateTimeString UTC datetime string (e.g., "2024-01-15 14:30:00.123")
 * @returns Components in local timezone or null if invalid
 */
export function parseUTCToLocal(utcDateTimeString: string | null): DateTimeComponents | null {
  if (!utcDateTimeString) return null;

  try {
    // Parse the UTC string - ensure it's treated as UTC
    let dateStr = utcDateTimeString.trim();
    
    // Normalize format to ISO 8601 for Date constructor
    if (!dateStr.includes('T')) {
      dateStr = dateStr.replace(' ', 'T');
    }
    if (!dateStr.endsWith('Z') && !dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      dateStr = dateStr + 'Z'; // Treat as UTC
    }
    
    const utcDate = new Date(dateStr);
    
    if (isNaN(utcDate.getTime())) {
      console.error('Invalid UTC datetime string:', utcDateTimeString);
      return null;
    }
    
    // Convert to local timezone — all components must use local getters
    // (toISOString() returns UTC date, which is wrong when crossing midnight)
    const year = utcDate.getFullYear();
    const month = String(utcDate.getMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getDate()).padStart(2, '0');
    const hours = String(utcDate.getHours()).padStart(2, '0');
    const minutes = String(utcDate.getMinutes()).padStart(2, '0');
    const seconds = String(utcDate.getSeconds()).padStart(2, '0');
    const ms = String(utcDate.getMilliseconds()).padStart(3, '0');
    
    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}:${seconds}`,
      milliseconds: ms,
    };
  } catch (error) {
    console.error('Error parsing UTC datetime:', error);
    return null;
  }
}

/**
 * Format local timezone components to UTC string for backend
 * 
 * Takes datetime components in local timezone and converts to UTC string.
 * This is useful for sending filter values to the backend (which expects UTC).
 * 
 * @param components Date, time, and milliseconds in local timezone
 * @returns UTC datetime string in database format "2024-01-15 14:30:00.123"
 */
export function formatLocalToUTC(components: DateTimeComponents): string {
  const { date, time, milliseconds } = components;
  
  // Create a Date object from local timezone components
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const localDate = new Date(date);
  localDate.setHours(hours, minutes, seconds, parseInt(milliseconds, 10));
  
  // Convert to UTC components
  const utcYear = localDate.getUTCFullYear();
  const utcMonth = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const utcDay = String(localDate.getUTCDate()).padStart(2, '0');
  const utcHours = String(localDate.getUTCHours()).padStart(2, '0');
  const utcMinutes = String(localDate.getUTCMinutes()).padStart(2, '0');
  const utcSeconds = String(localDate.getUTCSeconds()).padStart(2, '0');
  const utcMs = String(localDate.getUTCMilliseconds()).padStart(3, '0');
  
  return `${utcYear}-${utcMonth}-${utcDay} ${utcHours}:${utcMinutes}:${utcSeconds}.${utcMs}`;
}

/**
 * Format components into datetime string with milliseconds
 * 
 * Uses ISO 8601 format: "2024-01-15T14:30:00.123Z"
 * The trailing 'Z' is critical for ClickHouse's parseDateTime64BestEffort()
 * to interpret the timestamp as UTC rather than server-local time.
 * 
 * @param components Date, time, and milliseconds components
 * @returns Datetime string like "2024-01-15T14:30:00.123Z"
 */
export function formatISODateTime(components: DateTimeComponents): string {
  const { date, time, milliseconds } = components;
  
  // Validate and pad milliseconds
  const ms = milliseconds.padStart(3, '0').substring(0, 3);
  
  return `${date}T${time}.${ms}Z`;
}

/**
 * Get current datetime as components (in LOCAL timezone)
 * 
 * Returns datetime in the browser's local timezone to match what charts display.
 */
export function getCurrentDateTime(): DateTimeComponents {
  const now = new Date();
  
  // Get all components in LOCAL timezone (not UTC)
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}:${seconds}`,
    milliseconds,
  };
}

/**
 * Format datetime for display (human-readable)
 * 
 * @param isoString ISO 8601 datetime string
 * @returns Formatted string like "Jan 15, 2024, 2:30:00.123 PM"
 */
export function formatDateTimeForDisplay(isoString: string): string {
  try {
    const date = new Date(isoString);
    const dateStr = date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const timeStr = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    
    return `${dateStr}, ${timeStr}.${ms}`;
  } catch (error) {
    return isoString;
  }
}

/**
 * Validate milliseconds value
 * 
 * @param ms Milliseconds as string
 * @returns Valid milliseconds string (0-999) or '000'
 */
export function validateMilliseconds(ms: string): string {
  const num = parseInt(ms, 10);
  if (isNaN(num) || num < 0) return '000';
  if (num > 999) return '999';
  return num.toString().padStart(3, '0');
}

/**
 * Add/subtract time from datetime string (works in LOCAL timezone)
 * 
 * @param dateTimeString Base datetime in local timezone
 * @param delta Time delta object
 * @returns New datetime string in database format
 */
export function adjustDateTime(
  dateTimeString: string,
  delta: {
    years?: number;
    months?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
  }
): string {
  // Parse as local time (no 'Z' - critical!)
  const date = new Date(dateTimeString.replace(' ', 'T'));
  
  // Apply deltas using local time methods
  if (delta.years) date.setFullYear(date.getFullYear() + delta.years);
  if (delta.months) date.setMonth(date.getMonth() + delta.months);
  if (delta.days) date.setDate(date.getDate() + delta.days);
  if (delta.hours) date.setHours(date.getHours() + delta.hours);
  if (delta.minutes) date.setMinutes(date.getMinutes() + delta.minutes);
  if (delta.seconds) date.setSeconds(date.getSeconds() + delta.seconds);
  if (delta.milliseconds) date.setMilliseconds(date.getMilliseconds() + delta.milliseconds);
  
  // Convert back to components in local timezone
  const components = {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`,
    milliseconds: String(date.getMilliseconds()).padStart(3, '0'),
  };
  
  return formatISODateTime(components);
}

/**
 * Get start of period (for presets, works in LOCAL timezone)
 * 
 * @param period Time period to get start of
 * @param from Base date (defaults to now)
 * @returns Datetime string in database format (local timezone)
 */
export function getStartOf(period: 'hour' | 'day' | 'week' | 'month' | 'year', from: Date = new Date()): string {
  const date = new Date(from);
  
  // Use local time methods (not UTC methods)
  switch (period) {
    case 'hour':
      date.setMinutes(0, 0, 0);
      break;
    case 'day':
      date.setHours(0, 0, 0, 0);
      break;
    case 'week':
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - date.getDay());
      break;
    case 'month':
      date.setHours(0, 0, 0, 0);
      date.setDate(1);
      break;
    case 'year':
      date.setHours(0, 0, 0, 0);
      date.setMonth(0, 1);
      break;
  }
  
  // Convert to components using local time (not UTC)
  const components = {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`,
    milliseconds: String(date.getMilliseconds()).padStart(3, '0'),
  };
  
  return formatISODateTime(components);
}

/**
 * Round datetime to nearest millisecond boundary
 * 
 * @param dateTimeString Datetime string
 * @returns Datetime string in database format
 */
export function roundToMillisecond(dateTimeString: string): string {
  const date = new Date(dateTimeString.replace(' ', 'T') + 'Z');
  const components = parseISODateTime(date.toISOString());
  return components ? formatISODateTime(components) : dateTimeString;
}
