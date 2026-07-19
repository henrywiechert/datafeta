// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { formatNumericTick, isContinuousNumericDomain } from './numericTickFormat';

describe('formatNumericTick', () => {
  it('formats thousands and larger with SI-style K/M/B/T units', () => {
    expect(formatNumericTick(1500)).toBe('1.5K');
    expect(formatNumericTick(2_000_000)).toBe('2M');
    expect(formatNumericTick(2_500_000)).toBe('2.5M');
    expect(formatNumericTick(2_000_000_000)).toBe('2B');
    expect(formatNumericTick(1_000_000_000_000)).toBe('1T');
  });

  it('preserves sign for negative values', () => {
    expect(formatNumericTick(-2_500_000)).toBe('-2.5M');
    expect(formatNumericTick(-1500)).toBe('-1.5K');
  });

  it('re-promotes to the next unit when rounding overflows', () => {
    expect(formatNumericTick(999_950)).toBe('1M');
  });

  it('renders mid-range values under 1000 without a unit', () => {
    expect(formatNumericTick(0)).toBe('0');
    expect(formatNumericTick(950)).toBe('950');
    expect(formatNumericTick(2.5)).toBe('2.5');
    expect(formatNumericTick(0.5)).toBe('0.5');
  });

  it('uses short scientific notation for tiny magnitudes', () => {
    expect(formatNumericTick(0.0001)).toBe('1e-4');
  });

  it('returns an empty string for non-finite / non-numeric input', () => {
    expect(formatNumericTick(NaN)).toBe('');
    expect(formatNumericTick(Infinity)).toBe('');
    expect(formatNumericTick('123')).toBe('');
    expect(formatNumericTick(null)).toBe('');
    expect(formatNumericTick(undefined)).toBe('');
  });
});

describe('isContinuousNumericDomain', () => {
  it('accepts a numeric two-element domain', () => {
    expect(isContinuousNumericDomain([0, 2_000_000])).toBe(true);
    expect(isContinuousNumericDomain([-5, 5])).toBe(true);
  });

  it('rejects band, date, and malformed domains', () => {
    expect(isContinuousNumericDomain(['A', 'B'], 'band')).toBe(false);
    expect(isContinuousNumericDomain([0, 100], 'band')).toBe(false);
    expect(isContinuousNumericDomain([new Date(), new Date()])).toBe(false);
    expect(isContinuousNumericDomain(['2024-01-01', '2024-12-31'])).toBe(false);
    expect(isContinuousNumericDomain([0])).toBe(false);
    expect(isContinuousNumericDomain(undefined)).toBe(false);
  });
});
