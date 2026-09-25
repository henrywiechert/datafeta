// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { formatDateAxisTick, formatDateTick } from './dateFormatUtils';

describe('formatDateTick', () => {
  it('should format date with time as ISO-like string', () => {
    const date = new Date('2023-10-20T14:30:00Z');
    expect(formatDateTick(date)).toBe('2023-10-20 14:30:00');
  });

  it('should format midnight dates without time component', () => {
    const date = new Date('2023-10-20T00:00:00Z');
    expect(formatDateTick(date)).toBe('2023-10-20');
  });

  it('should include seconds when non-zero', () => {
    const date = new Date('2023-10-20T14:30:45Z');
    expect(formatDateTick(date)).toBe('2023-10-20 14:30:45');
  });

  it('should handle numeric timestamps', () => {
    const timestamp = Date.UTC(2023, 9, 20, 14, 30, 0); // Oct 20, 2023 14:30 UTC
    expect(formatDateTick(timestamp)).toBe('2023-10-20 14:30:00');
  });

  it('should handle ISO string input', () => {
    expect(formatDateTick('2023-10-20T14:30:00Z')).toBe('2023-10-20 14:30:00');
  });

  it('should return empty string for null', () => {
    expect(formatDateTick(null as any)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(formatDateTick(undefined as any)).toBe('');
  });

  it('should return original value for invalid date', () => {
    expect(formatDateTick('not a date')).toBe('not a date');
  });
});

describe('formatDateAxisTick', () => {
  const fmtAll = (isoTicks: string[]) => {
    const ticks = isoTicks.map((s) => new Date(s));
    return ticks.map((t, i) => formatDateAxisTick(t, i, ticks));
  };

  it('shows seconds only, with the date once, for a minutes-long span', () => {
    expect(fmtAll(['2026-01-16T12:27:00Z', '2026-01-16T12:27:30Z', '2026-01-16T12:28:00Z']))
      .toEqual(['12:27:00\n2026-01-16', '12:27:30', '12:28:00']);
  });

  it('drops seconds when all ticks are on whole minutes', () => {
    expect(fmtAll(['2026-01-16T12:00:00Z', '2026-01-16T12:30:00Z', '2026-01-16T13:00:00Z']))
      .toEqual(['12:00\n2026-01-16', '12:30', '13:00']);
  });

  it('shows milliseconds for sub-second spans', () => {
    expect(fmtAll(['2026-01-16T12:27:00.100Z', '2026-01-16T12:27:00.200Z']))
      .toEqual(['12:27:00.100\n2026-01-16', '12:27:00.200']);
  });

  it('repeats the date where the day changes', () => {
    expect(fmtAll(['2026-01-16T18:00:00Z', '2026-01-17T00:00:00Z', '2026-01-17T06:00:00Z']))
      .toEqual(['18:00\n2026-01-16', '00:00\n2026-01-17', '06:00']);
  });

  it('collapses day, month and year steps', () => {
    expect(fmtAll(['2026-01-16T00:00:00Z', '2026-01-17T00:00:00Z'])).toEqual(['2026-01-16', '2026-01-17']);
    expect(fmtAll(['2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'])).toEqual(['2026-01', '2026-02']);
    expect(fmtAll(['2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z'])).toEqual(['2025', '2026']);
  });

  it('falls back to the full timestamp without tick context', () => {
    expect(formatDateAxisTick(new Date('2026-01-16T12:27:30Z'))).toBe('2026-01-16 12:27:30');
  });
});
