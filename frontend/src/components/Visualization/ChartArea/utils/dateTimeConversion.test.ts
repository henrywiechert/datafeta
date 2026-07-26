// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { toDatePartInteger } from './dateTimeConversion';

describe('toDatePartInteger', () => {
  test('extracts ISO week-of-year for known UTC dates', () => {
    // 2024-01-01 was a Monday → ISO week 1
    expect(toDatePartInteger(new Date(Date.UTC(2024, 0, 1)), 'week')).toBe(1);
    // 2020-12-31 Thursday → ISO week 53 of 2020
    expect(toDatePartInteger(new Date(Date.UTC(2020, 11, 31)), 'week')).toBe(53);
    // 2021-01-04 Monday → ISO week 1 of 2021
    expect(toDatePartInteger(new Date(Date.UTC(2021, 0, 4)), 'week')).toBe(1);
  });

  test('passes through already-small distinct integers', () => {
    expect(toDatePartInteger(42, 'week')).toBe(42);
  });

  test('extracts ISO weekday Mon=1..Sun=7', () => {
    expect(toDatePartInteger(new Date(Date.UTC(2024, 0, 1)), 'weekday')).toBe(1); // Mon
    expect(toDatePartInteger(new Date(Date.UTC(2024, 0, 7)), 'weekday')).toBe(7); // Sun
  });
});
