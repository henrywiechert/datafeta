// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { adjustDateTime, getStartOf, parseISODateTime } from './datetimeFormatUtils';

describe('getStartOf', () => {
  test('week starts on Monday (ISO)', () => {
    // Wednesday 2024-01-03 local → Monday 2024-01-01
    const wed = new Date(2024, 0, 3, 15, 30, 0);
    const start = getStartOf('week', wed);
    expect(start.startsWith('2024-01-01')).toBe(true);

    // Sunday 2024-01-07 local → Monday 2024-01-01 (same ISO week)
    const sun = new Date(2024, 0, 7, 12, 0, 0);
    expect(getStartOf('week', sun).startsWith('2024-01-01')).toBe(true);

    // Monday stays Monday
    const mon = new Date(2024, 0, 1, 8, 0, 0);
    expect(getStartOf('week', mon).startsWith('2024-01-01')).toBe(true);
  });
});

describe('adjustDateTime', () => {
  test('treats trailing Z as wall-clock label, not real UTC (preset math)', () => {
    // Presets format local components with a trailing Z for ClickHouse.
    // Arithmetic must not reinterpret those digits as UTC (CET would shift by 1–2h).
    const end = '2024-08-01T19:30:00.000Z';
    const start = adjustDateTime(end, { hours: -1 });
    const startParts = parseISODateTime(start);
    const endParts = parseISODateTime(end);

    expect(startParts).not.toBeNull();
    expect(endParts).not.toBeNull();
    expect(startParts!.date).toBe('2024-08-01');
    expect(startParts!.time).toBe('18:30:00');
    expect(endParts!.time).toBe('19:30:00');
  });

  test('Last 24 Hours stays a 24h wall-clock delta when Z is present', () => {
    const end = '2024-08-01T19:30:00.000Z';
    const start = adjustDateTime(end, { hours: -24 });
    const startParts = parseISODateTime(start);

    expect(startParts).not.toBeNull();
    expect(startParts!.date).toBe('2024-07-31');
    expect(startParts!.time).toBe('19:30:00');
  });
});
