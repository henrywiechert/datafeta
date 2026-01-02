import { formatDateTick, createDateTickFormatter, normalizeCategoryDomain, normalizeDataForBandScale } from './dateFormatUtils';

describe('formatDateTick', () => {
  it('should format date with time as ISO-like string', () => {
    const date = new Date('2023-10-20T14:30:00Z');
    expect(formatDateTick(date)).toBe('2023-10-20 14:30');
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
    expect(formatDateTick(timestamp)).toBe('2023-10-20 14:30');
  });

  it('should handle ISO string input', () => {
    expect(formatDateTick('2023-10-20T14:30:00Z')).toBe('2023-10-20 14:30');
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

describe('createDateTickFormatter', () => {
  it('should return a function that formats dates', () => {
    const formatter = createDateTickFormatter();
    const date = new Date('2023-10-20T14:30:00Z');
    expect(formatter(date)).toBe('2023-10-20 14:30');
  });
});

describe('normalizeCategoryDomain', () => {
  it('should convert Date objects to formatted strings', () => {
    const dates = [
      new Date('2023-10-20T00:00:00Z'),
      new Date('2023-10-21T00:00:00Z'),
      new Date('2023-10-22T14:30:00Z'),
    ];
    const result = normalizeCategoryDomain(dates);
    expect(result).toEqual(['2023-10-20', '2023-10-21', '2023-10-22 14:30']);
  });

  it('should leave non-Date values unchanged', () => {
    const categories = ['Category A', 'Category B', 123];
    const result = normalizeCategoryDomain(categories);
    expect(result).toEqual(['Category A', 'Category B', 123]);
  });

  it('should handle mixed Date and non-Date values', () => {
    const mixed = ['Label', new Date('2023-10-20T00:00:00Z'), 42];
    const result = normalizeCategoryDomain(mixed);
    expect(result).toEqual(['Label', '2023-10-20', 42]);
  });

  it('should return input unchanged if no Dates present', () => {
    const categories = ['A', 'B', 'C'];
    const result = normalizeCategoryDomain(categories);
    expect(result).toBe(categories); // Same reference
  });

  it('should handle empty array', () => {
    expect(normalizeCategoryDomain([])).toEqual([]);
  });
});

describe('normalizeDataForBandScale', () => {
  it('should convert Date values in category column to strings', () => {
    const rows = [
      { category: new Date('2023-10-20T00:00:00Z'), value: 10 },
      { category: new Date('2023-10-21T14:30:00Z'), value: 20 },
    ];
    const result = normalizeDataForBandScale(rows, 'category');
    expect(result).toEqual([
      { category: '2023-10-20', value: 10 },
      { category: '2023-10-21 14:30', value: 20 },
    ]);
  });

  it('should leave other columns unchanged', () => {
    const rows = [
      { category: new Date('2023-10-20T00:00:00Z'), date: new Date('2023-01-01T00:00:00Z'), value: 10 },
    ];
    const result = normalizeDataForBandScale(rows, 'category');
    expect(result[0].category).toBe('2023-10-20');
    expect(result[0].date).toBeInstanceOf(Date); // Other Date columns unchanged
  });

  it('should return input unchanged if no Dates in category column', () => {
    const rows = [
      { category: 'A', value: 10 },
      { category: 'B', value: 20 },
    ];
    const result = normalizeDataForBandScale(rows, 'category');
    expect(result).toBe(rows); // Same reference
  });

  it('should return input unchanged if categoryColumn is undefined', () => {
    const rows = [{ value: 10 }];
    const result = normalizeDataForBandScale(rows, undefined);
    expect(result).toBe(rows);
  });

  it('should handle empty rows', () => {
    expect(normalizeDataForBandScale([], 'category')).toEqual([]);
  });
});
