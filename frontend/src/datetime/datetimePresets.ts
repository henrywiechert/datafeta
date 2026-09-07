// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * DateTime Preset Configurations
 * 
 * Quick preset options for datetime filtering.
 * Presets calculate start/end datetime based on current time or data boundaries.
 */

import { adjustDateTime, getStartOf, toDateTimeComponents, formatISODateTime } from './datetimeFormatUtils';

export interface DateTimePreset {
  label: string;
  /**
   * Whether the range is anchored to "now" and must therefore be recalculated
   * whenever the preset is re-applied (e.g. when a snapshot is loaded days after
   * it was saved). Defaults to true — only data-bounded presets ('All Time',
   * which resolves against the column's min/max) set this to false.
   */
  relative?: boolean;
  getValue: (now?: Date, dataMin?: string, dataMax?: string) => {
    start: string;  // Database format: "2024-01-15 14:30:00.123"
    end: string;    // Database format: "2024-01-15 14:30:00.123"
  };
}

/** Preset label meaning "no preset" — the user typed the dates by hand. */
export const CUSTOM_PRESET_LABEL = 'custom';

/**
 * Full DateTime presets (for fields without datetime parts)
 */
export const FULL_DATETIME_PRESETS: DateTimePreset[] = [
  {
    label: 'Last Hour',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { hours: -1 });
      return { start, end };
    },
  },
  {
    label: 'Last 6 Hours',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { hours: -6 });
      return { start, end };
    },
  },
  {
    label: 'Last 24 Hours',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { hours: -24 });
      return { start, end };
    },
  },
  {
    label: 'Last 7 Days',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { days: -7 });
      return { start, end };
    },
  },
  {
    label: 'Last 30 Days',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { days: -30 });
      return { start, end };
    },
  },
  {
    label: 'Today',
    getValue: (now = new Date()) => {
      const start = getStartOf('day', now);
      const end = formatISODateTime(toDateTimeComponents(now));
      return { start, end };
    },
  },
  {
    label: 'This Week',
    getValue: (now = new Date()) => {
      const start = getStartOf('week', now);
      const end = formatISODateTime(toDateTimeComponents(now));
      return { start, end };
    },
  },
  {
    label: 'This Month',
    getValue: (now = new Date()) => {
      const start = getStartOf('month', now);
      const end = formatISODateTime(toDateTimeComponents(now));
      return { start, end };
    },
  },
  {
    label: 'This Year',
    getValue: (now = new Date()) => {
      const start = getStartOf('year', now);
      const end = formatISODateTime(toDateTimeComponents(now));
      return { start, end };
    },
  },
  {
    label: 'All Time',
    // Bounded by the data, not by "now": re-resolving it without the column's
    // min/max would widen the range to 1970..now, so keep the stored dates.
    relative: false,
    getValue: (now = new Date(), dataMin?: string, dataMax?: string) => {
      return {
        start: dataMin || '1970-01-01 00:00:00.000',
        end: dataMax || formatISODateTime(toDateTimeComponents(now)),
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
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { hours: -6 });
      return { start, end };
    },
  },
  {
    label: 'Last 12 Hours',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { hours: -12 });
      return { start, end };
    },
  },
  {
    label: 'Last 24 Hours',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
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
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { days: -7 });
      return { start, end };
    },
  },
  {
    label: 'Last 14 Days',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { days: -14 });
      return { start, end };
    },
  },
  {
    label: 'Last 30 Days',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { days: -30 });
      return { start, end };
    },
  },
  {
    label: 'This Month',
    getValue: (now = new Date()) => {
      const start = getStartOf('month', now);
      const end = formatISODateTime(toDateTimeComponents(now));
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
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { months: -3 });
      return { start, end };
    },
  },
  {
    label: 'Last 6 Months',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { months: -6 });
      return { start, end };
    },
  },
  {
    label: 'Last 12 Months',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { months: -12 });
      return { start, end };
    },
  },
  {
    label: 'This Year',
    getValue: (now = new Date()) => {
      const start = getStartOf('year', now);
      const end = formatISODateTime(toDateTimeComponents(now));
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
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { years: -2 });
      return { start, end };
    },
  },
  {
    label: 'Last 5 Years',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
      const start = adjustDateTime(end, { years: -5 });
      return { start, end };
    },
  },
  {
    label: 'Last 10 Years',
    getValue: (now = new Date()) => {
      const end = formatISODateTime(toDateTimeComponents(now));
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
    case 'week':
      return TIMELINE_DAY_PRESETS;
    case 'month':
      return TIMELINE_MONTH_PRESETS;
    case 'year':
      return TIMELINE_YEAR_PRESETS;
    default:
      return FULL_DATETIME_PRESETS;
  }
}

/**
 * Look up a preset by label for a given datetime part.
 *
 * Returns undefined for 'custom', for an unknown label (e.g. a preset that was
 * renamed after a snapshot was saved), and for a label that isn't offered for
 * this part — in all those cases the caller must keep the stored dates.
 */
export function findPresetByLabel(
  label: string | null | undefined,
  dateTimePart?: string,
): DateTimePreset | undefined {
  if (!label || label === CUSTOM_PRESET_LABEL) return undefined;
  return getPresetsForField(dateTimePart).find(p => p.label === label);
}

/**
 * True when a preset label denotes a range anchored to "now", i.e. one that has
 * to be recalculated instead of restored from the stored start/end dates.
 */
export function isRelativePresetLabel(
  label: string | null | undefined,
  dateTimePart?: string,
): boolean {
  const preset = findPresetByLabel(label, dateTimePart);
  return !!preset && preset.relative !== false;
}

/**
 * Recalculate a relative preset's range against the current time.
 *
 * Returns null when the label is not a relative preset (custom range, unknown
 * label, or a data-bounded preset such as 'All Time'), signalling "keep the
 * stored dates".
 */
export function resolveRelativePreset(
  label: string | null | undefined,
  dateTimePart?: string,
  now: Date = new Date(),
): { start: string; end: string } | null {
  const preset = findPresetByLabel(label, dateTimePart);
  if (!preset || preset.relative === false) return null;
  return preset.getValue(now);
}
