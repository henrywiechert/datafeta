import { formatDateTick } from './dateFormatUtils';

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
