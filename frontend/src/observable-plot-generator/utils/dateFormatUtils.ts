// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Date formatting utilities for Observable Plot axes.
 * Provides concise, readable date labels instead of verbose Date.toString() output.
 */

import { formatDateTimeDisplay } from '../../datetime/datetimeDisplayFormat';

/**
 * Format a date for axis tick labels.
 * Produces a concise UTC ISO-like format: "YYYY-MM-DD" at midnight, otherwise
 * "YYYY-MM-DD HH:mm:ss". Seconds are always shown for consistency, since these
 * values may also serve as filter keys sent to the backend.
 */
export function formatDateTick(date: Date | number | string): string {
  if (date === null || date === undefined) return '';
  return formatDateTimeDisplay(date, { collapseMidnight: true }) ?? String(date);
}

