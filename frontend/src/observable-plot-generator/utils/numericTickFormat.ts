// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Compact numeric axis tick formatting.
 *
 * Continuous numeric axes otherwise fall back to Observable Plot / d3 defaults,
 * which render full numbers (e.g. "2000000") that overlap badly on narrow or
 * faceted axes. This produces short SI-style labels ("2M", "1.5K", "2.5B") using
 * the same K/M/B/T unit convention already used elsewhere in the app
 * (`formatCompactCount`), while also handling negatives and sub-thousand floats.
 */

const SI_UNITS = ['', 'K', 'M', 'B', 'T'] as const;

function trimTrailingZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Format a numeric tick value into a compact, readable label.
 * Non-numeric / non-finite values return an empty string so date axes and
 * missing values don't produce misleading output.
 */
export function formatNumericTick(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (value === 0) return '0';

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  // Very small non-zero magnitudes: short scientific notation (e.g. 1e-4).
  if (abs < 1e-3) {
    const [mantissa, exponent] = abs.toExponential(1).split('e');
    return `${sign}${trimTrailingZeros(mantissa)}e${exponent}`;
  }

  // Sub-thousand: plain integer or a trimmed decimal.
  if (abs < 1000) {
    const decimals = abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
    return `${sign}${trimTrailingZeros(abs.toFixed(decimals))}`;
  }

  // Thousands and beyond: SI-style K/M/B/T.
  let unitIndex = 0;
  let scaled = abs;
  while (scaled >= 1000 && unitIndex < SI_UNITS.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }
  let rounded = Number(scaled.toFixed(scaled >= 100 ? 0 : 1));
  // Re-promote if rounding pushed us into the next unit (e.g. 999.95K → 1M).
  if (rounded >= 1000 && unitIndex < SI_UNITS.length - 1) {
    rounded /= 1000;
    unitIndex += 1;
  }
  const text = trimTrailingZeros(rounded.toFixed(Number.isInteger(rounded) ? 0 : 1));
  return `${sign}${text}${SI_UNITS[unitIndex]}`;
}

/**
 * True when a scale domain represents a continuous numeric range (as opposed to
 * a categorical band or a date/time range). Used to decide when the compact
 * numeric tick formatter should be applied.
 */
export function isContinuousNumericDomain(domain: unknown, type?: string): boolean {
  if (type === 'band') return false;
  if (!Array.isArray(domain) || domain.length !== 2) return false;
  const [a, b] = domain;
  if (a instanceof Date || b instanceof Date) return false;
  if (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a)) return false;
  return (
    typeof a === 'number' && Number.isFinite(a) &&
    typeof b === 'number' && Number.isFinite(b)
  );
}
