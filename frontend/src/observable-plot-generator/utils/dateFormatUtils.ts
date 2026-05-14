// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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

  // Show date and time (always include seconds for consistent formatting,
  // since these values may also serve as filter keys sent to the backend)
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${year}-${month}-${day} ${hh}:${mm}:${ss}`;
}

