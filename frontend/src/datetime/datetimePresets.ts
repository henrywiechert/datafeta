/**
 * DateTime Preset Configurations
 * 
 * Quick preset options for datetime filtering.
 * Presets calculate start/end datetime based on current time or data boundaries.
 */

import { adjustDateTime, getStartOf, getCurrentDateTime, formatISODateTime } from './datetimeFormatUtils';

export interface DateTimePreset {
  label: string;
  getValue: (now?: Date, dataMin?: string, dataMax?: string) => {
    start: string;  // Database format: "2024-01-15 14:30:00.123"
    end: string;    // Database format: "2024-01-15 14:30:00.123"
  };
}

/**
 * Full DateTime presets (for fields without datetime parts)
 */
export const FULL_DATETIME_PRESETS: DateTimePreset[] = [
  {
    label: 'Last Hour',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { hours: -1 });
      return { start, end };
    },
  },
  {
    label: 'Last 6 Hours',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { hours: -6 });
      return { start, end };
    },
  },
  {
    label: 'Last 24 Hours',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { hours: -24 });
      return { start, end };
    },
  },
  {
    label: 'Last 7 Days',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { days: -7 });
      return { start, end };
    },
  },
  {
    label: 'Last 30 Days',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { days: -30 });
      return { start, end };
    },
  },
  {
    label: 'Today',
    getValue: (now = new Date()) => {
      const start = getStartOf('day', now);
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      return { start, end };
    },
  },
  {
    label: 'This Week',
    getValue: (now = new Date()) => {
      const start = getStartOf('week', now);
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      return { start, end };
    },
  },
  {
    label: 'This Month',
    getValue: (now = new Date()) => {
      const start = getStartOf('month', now);
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      return { start, end };
    },
  },
  {
    label: 'This Year',
    getValue: (now = new Date()) => {
      const start = getStartOf('year', now);
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      return { start, end };
    },
  },
  {
    label: 'All Time',
    getValue: (now = new Date(), dataMin?: string, dataMax?: string) => {
      const current = getCurrentDateTime();
      return {
        start: dataMin || '1970-01-01 00:00:00.000',
        end: dataMax || formatISODateTime(current),
      };
    },
  },
];

/**
 * Timeline Hour presets
 */
export const TIMELINE_HOUR_PRESETS: DateTimePreset[] = [
  {
    label: 'Last 6 Hours',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { hours: -6 });
      return { start, end };
    },
  },
  {
    label: 'Last 12 Hours',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { hours: -12 });
      return { start, end };
    },
  },
  {
    label: 'Last 24 Hours',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { hours: -24 });
      return { start, end };
    },
  },
  {
    label: 'Working Hours Today (8-18)',
    getValue: (now = new Date()) => {
      const today = getStartOf('day', now);
      const start = adjustDateTime(today, { hours: 8 });
      const end = adjustDateTime(today, { hours: 18 });
      return { start, end };
    },
  },
];

/**
 * Timeline Day presets
 */
export const TIMELINE_DAY_PRESETS: DateTimePreset[] = [
  {
    label: 'Last 7 Days',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { days: -7 });
      return { start, end };
    },
  },
  {
    label: 'Last 14 Days',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { days: -14 });
      return { start, end };
    },
  },
  {
    label: 'Last 30 Days',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { days: -30 });
      return { start, end };
    },
  },
  {
    label: 'This Month',
    getValue: (now = new Date()) => {
      const start = getStartOf('month', now);
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      return { start, end };
    },
  },
];

/**
 * Timeline Month presets
 */
export const TIMELINE_MONTH_PRESETS: DateTimePreset[] = [
  {
    label: 'Last 3 Months',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { months: -3 });
      return { start, end };
    },
  },
  {
    label: 'Last 6 Months',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { months: -6 });
      return { start, end };
    },
  },
  {
    label: 'Last 12 Months',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { months: -12 });
      return { start, end };
    },
  },
  {
    label: 'This Year',
    getValue: (now = new Date()) => {
      const start = getStartOf('year', now);
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      return { start, end };
    },
  },
];

/**
 * Timeline Year presets
 */
export const TIMELINE_YEAR_PRESETS: DateTimePreset[] = [
  {
    label: 'Last 2 Years',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { years: -2 });
      return { start, end };
    },
  },
  {
    label: 'Last 5 Years',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { years: -5 });
      return { start, end };
    },
  },
  {
    label: 'Last 10 Years',
    getValue: (now = new Date()) => {
      const current = getCurrentDateTime();
      const end = formatISODateTime(current);
      const start = adjustDateTime(end, { years: -10 });
      return { start, end };
    },
  },
];

/**
 * Get appropriate presets for a datetime field configuration
 */
export function getPresetsForField(dateTimePart?: string): DateTimePreset[] {
  if (!dateTimePart) {
    // Full datetime - use full presets
    return FULL_DATETIME_PRESETS;
  }
  
  // Timeline parts - use part-specific presets
  switch (dateTimePart) {
    case 'hour':
    case 'minute':
    case 'second':
      return TIMELINE_HOUR_PRESETS;
    case 'day':
    case 'weekday':
      return TIMELINE_DAY_PRESETS;
    case 'month':
      return TIMELINE_MONTH_PRESETS;
    case 'year':
      return TIMELINE_YEAR_PRESETS;
    default:
      return FULL_DATETIME_PRESETS;
  }
}
