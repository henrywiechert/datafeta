// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { epochToPreciseDate, epochUnitToPreciseDate, formatDateTimeDisplay, PreciseDate } from './datetimeDisplayFormat';

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

describe('sub-millisecond precision carried on the Date', () => {
  // A JS Date only holds milliseconds. epochToPreciseDate hangs the microsecond
  // fraction off the Date so formatters can recover it — without this the value
  // is truncated in the row before any formatter runs.
  it('recovers microseconds from a Date built by epochToPreciseDate', () => {
    const d = epochToPreciseDate(MICROS)!;
    expect(formatDateTimeDisplay(d, { precision: 'us' })).toBe('2023-11-14 22:13:20.123456');
  });

  it('keeps the carrier invisible to enumeration and serialization', () => {
    const d = epochToPreciseDate(MICROS)!;
    expect(Object.keys(d)).toEqual([]);
    expect(JSON.parse(JSON.stringify({ ts: d }))).toEqual({ ts: d.toISOString() });
  });

  it('falls back to millisecond resolution for a plain Date', () => {
    const plain = new Date('2023-11-14T22:13:20.123Z');
    expect(formatDateTimeDisplay(plain, { precision: 'us' })).toBe('2023-11-14 22:13:20.123000');
  });
});

describe('PreciseDate numeric value', () => {
  // Two points 300 µs apart in the same millisecond: a plain Date makes them one
  // value, so a time axis plots them on top of each other.
  const a = epochUnitToPreciseDate(MICROS, 'us')!;
  const b = epochUnitToPreciseDate(MICROS + 300, 'us')!;

  it('keeps the microseconds in valueOf, so same-millisecond values order and plot apart', () => {
    expect(a.getTime()).toBe(b.getTime());
    expect(+a).toBeCloseTo(1_700_000_000_123.456, 3);
    expect(+b - +a).toBeCloseTo(0.3, 3);
    expect(a < b).toBe(true);
  });

  it('stays a whole-millisecond Date everywhere else', () => {
    expect(a).toBeInstanceOf(Date);
    expect(a.toISOString()).toBe('2023-11-14T22:13:20.123Z');
    expect(new Date(a).getTime()).toBe(a.getTime());
  });

  it('is only used when there is a sub-millisecond part', () => {
    expect(epochUnitToPreciseDate(MICROS - 456, 'us')).not.toBeInstanceOf(PreciseDate);
    expect(epochUnitToPreciseDate(MILLIS + 123, 'ms')).not.toBeInstanceOf(PreciseDate);
    expect(epochUnitToPreciseDate(MICROS, 'us')).toBeInstanceOf(PreciseDate);
  });

  it('round-trips a fractional epoch-ms value at microsecond resolution', () => {
    const d = epochUnitToPreciseDate(+b, 'ms')!;
    expect(formatDateTimeDisplay(d, { precision: 'us' })).toBe('2023-11-14 22:13:20.123756');
  });

  it('keeps nanosecond sources at microsecond resolution', () => {
    const d = epochUnitToPreciseDate(NANOS + 123_456_789, 'ns')!;
    expect(formatDateTimeDisplay(d, { precision: 'us' })).toBe('2023-11-14 22:13:20.123456');
  });

  it('handles pre-1970 values with a known unit', () => {
    const d = epochUnitToPreciseDate(-1_500, 'us')!; // 1969-12-31T23:59:59.998500Z
    expect(d.getTime()).toBe(-2);
    expect(+d).toBeCloseTo(-1.5, 6);
    expect(formatDateTimeDisplay(d, { precision: 'us' })).toBe('1969-12-31 23:59:59.998500');
  });
});

describe('auto precision', () => {
  it('shows microseconds when the value carries them', () => {
    expect(formatDateTimeDisplay(MICROS, { precision: 'auto' })).toBe('2023-11-14 22:13:20.123456');
  });

  it('shows milliseconds when that is all the value carries', () => {
    const msOnly = 1_700_000_000_123;
    expect(formatDateTimeDisplay(msOnly, { precision: 'auto' })).toBe('2023-11-14 22:13:20.123');
  });

  it('shows no fraction for a whole-second value', () => {
    // Guards every existing caller: whole seconds must render byte-identically.
    expect(formatDateTimeDisplay(SECONDS, { precision: 'auto' })).toBe('2023-11-14 22:13:20');
    expect(formatDateTimeDisplay(MILLIS, { precision: 'auto' })).toBe('2023-11-14 22:13:20');
  });
});
