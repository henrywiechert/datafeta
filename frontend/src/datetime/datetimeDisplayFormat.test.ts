// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { formatDateTimeDisplay } from './datetimeDisplayFormat';

// 1_700_000_000 s = 1_700_000_000_000 ms = 2023-11-14T22:13:20Z
const SECONDS = 1_700_000_000;
const MILLIS = 1_700_000_000_000;
const MICROS = 1_700_000_000_123_456;
const NANOS = 1_700_000_000_000_000_000;

describe('formatDateTimeDisplay', () => {
  it('defaults to UTC second precision', () => {
    expect(formatDateTimeDisplay(MILLIS)).toBe('2023-11-14 22:13:20');
  });

  it('interprets second-scale epochs', () => {
    expect(formatDateTimeDisplay(SECONDS)).toBe('2023-11-14 22:13:20');
  });

  it('interprets microsecond-scale epochs', () => {
    expect(formatDateTimeDisplay(MICROS)).toBe('2023-11-14 22:13:20');
  });

  it('interprets nanosecond-scale epochs', () => {
    expect(formatDateTimeDisplay(NANOS)).toBe('2023-11-14 22:13:20');
  });

  it('accepts bigint epochs', () => {
    expect(formatDateTimeDisplay(BigInt(MILLIS))).toBe('2023-11-14 22:13:20');
  });

  it('renders millisecond precision', () => {
    expect(formatDateTimeDisplay(MICROS, { precision: 'ms' })).toBe('2023-11-14 22:13:20.123');
  });

  it('renders microsecond precision', () => {
    expect(formatDateTimeDisplay(MICROS, { precision: 'us' })).toBe('2023-11-14 22:13:20.123456');
  });

  it('scales a Date millisecond fraction to microseconds', () => {
    const d = new Date('2023-11-14T22:13:20.123Z');
    expect(formatDateTimeDisplay(d, { precision: 'us' })).toBe('2023-11-14 22:13:20.123000');
  });

  it('formats Date instances', () => {
    expect(formatDateTimeDisplay(new Date('2023-11-14T22:13:20Z'))).toBe('2023-11-14 22:13:20');
  });

  it('formats ISO strings', () => {
    expect(formatDateTimeDisplay('2023-11-14T22:13:20Z')).toBe('2023-11-14 22:13:20');
  });

  it('collapses midnight to a date-only string when requested', () => {
    const midnight = new Date('2023-11-14T00:00:00Z');
    expect(formatDateTimeDisplay(midnight, { collapseMidnight: true })).toBe('2023-11-14');
  });

  it('keeps the time component at midnight without collapseMidnight', () => {
    const midnight = new Date('2023-11-14T00:00:00Z');
    expect(formatDateTimeDisplay(midnight)).toBe('2023-11-14 00:00:00');
  });

  it('renders local components when timeZone is local', () => {
    const d = new Date('2023-11-14T22:13:20Z');
    const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
    const expected =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    expect(formatDateTimeDisplay(d, { timeZone: 'local' })).toBe(expected);
  });

  it('returns null for null/undefined', () => {
    expect(formatDateTimeDisplay(null)).toBeNull();
    expect(formatDateTimeDisplay(undefined)).toBeNull();
  });

  it('returns null for unparseable strings', () => {
    expect(formatDateTimeDisplay('not a date')).toBeNull();
  });

  it('returns null for non-finite numbers', () => {
    expect(formatDateTimeDisplay(NaN)).toBeNull();
    expect(formatDateTimeDisplay(Infinity)).toBeNull();
  });
});
