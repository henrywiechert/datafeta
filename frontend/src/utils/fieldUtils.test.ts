import { normalizeTimelineData, getResultColumnName } from './fieldUtils';
import { Field } from '../types';

describe('normalizeTimelineData', () => {
  const makeTimelineField = (columnName: string): Field => ({
    id: `${columnName}-id`,
    columnName,
    type: 'dimension',
    flavour: 'continuous', // Continuous = converted to Date
    dataType: 'datetime',
    dateTimePart: 'hour',
    dateTimeMode: 'timeline',
  });

  const makeDiscreteTimelineField = (columnName: string): Field => ({
    id: `${columnName}-id`,
    columnName,
    type: 'dimension',
    flavour: 'discrete', // Discrete timeline = NOT converted (used for faceting)
    dataType: 'datetime',
    dateTimePart: 'day',
    dateTimeMode: 'timeline',
  });

  const makeDistinctField = (columnName: string): Field => ({
    id: `${columnName}-id`,
    columnName,
    type: 'dimension',
    flavour: 'discrete',
    dataType: 'datetime',
    dateTimePart: 'hour',
    dateTimeMode: 'distinct',
  });

  const makeNonTimelineField = (columnName: string): Field => ({
    id: `${columnName}-id`,
    columnName,
    type: 'dimension',
    flavour: 'discrete',
    dataType: 'string',
  });

  it('should convert epoch seconds to Date for timeline fields', () => {
    const field = makeTimelineField('ts');
    const colName = getResultColumnName(field); // ts_hour_timeline
    const epochSeconds = 1703548800; // 2023-12-26T00:00:00Z
    const rows = [{ [colName]: epochSeconds, value: 10 }];

    const result = normalizeTimelineData(rows, [field]);

    expect(result[0][colName]).toBeInstanceOf(Date);
    expect((result[0][colName] as Date).getUTCFullYear()).toBe(2023);
  });

  it('should convert epoch milliseconds to Date for timeline fields', () => {
    const field = makeTimelineField('ts');
    const colName = getResultColumnName(field);
    const epochMs = 1703548800000; // 2023-12-26T00:00:00Z in ms
    const rows = [{ [colName]: epochMs, value: 10 }];

    const result = normalizeTimelineData(rows, [field]);

    expect(result[0][colName]).toBeInstanceOf(Date);
    expect((result[0][colName] as Date).toISOString()).toBe('2023-12-26T00:00:00.000Z');
  });

  it('should handle BigInt epoch values', () => {
    const field = makeTimelineField('ts');
    const colName = getResultColumnName(field);
    const epochMs = BigInt(1703548800000);
    const rows = [{ [colName]: epochMs, value: 10 }];

    const result = normalizeTimelineData(rows, [field]);

    expect(result[0][colName]).toBeInstanceOf(Date);
    expect((result[0][colName] as Date).toISOString()).toBe('2023-12-26T00:00:00.000Z');
  });

  it('should parse ISO date strings', () => {
    const field = makeTimelineField('ts');
    const colName = getResultColumnName(field);
    const isoString = '2023-12-26T12:30:00Z';
    const rows = [{ [colName]: isoString, value: 10 }];

    const result = normalizeTimelineData(rows, [field]);

    expect(result[0][colName]).toBeInstanceOf(Date);
    expect((result[0][colName] as Date).toISOString()).toBe('2023-12-26T12:30:00.000Z');
  });

  it('should leave Date objects as-is', () => {
    const field = makeTimelineField('ts');
    const colName = getResultColumnName(field);
    const dateObj = new Date('2023-12-26T00:00:00Z');
    const rows = [{ [colName]: dateObj, value: 10 }];

    const result = normalizeTimelineData(rows, [field]);

    expect(result[0][colName]).toBe(dateObj);
  });

  it('should not modify non-timeline fields', () => {
    const field = makeNonTimelineField('category');
    const rows = [{ category: 'A', value: 10 }];

    const result = normalizeTimelineData(rows, [field]);

    expect(result).toBe(rows); // Same reference (no transformation needed)
  });

  it('should NOT convert distinct datetime parts (hour 0-23 should remain as integers)', () => {
    const field = makeDistinctField('ts');
    // Use getResultColumnName to match what normalizeTimelineData uses internally
    const colName = getResultColumnName(field); // should be ts_hour_distinct
    expect(colName).toBe('ts_hour_distinct'); // verify column name format
    
    const rows = [
      { [colName]: 0, value: 10 },
      { [colName]: 12, value: 20 },
      { [colName]: 23, value: 30 },
    ];

    const result = normalizeTimelineData(rows, [field]);

    // Should return same reference (no transformation for distinct mode)
    expect(result).toBe(rows);
    // Values should remain as integers, not converted to dates
    expect(result[0][colName]).toBe(0);
    expect(result[1][colName]).toBe(12);
    expect(result[2][colName]).toBe(23);
  });

  it('should convert discrete timeline fields to Date (for readable facet labels)', () => {
    // Discrete timeline fields are also converted to Date for readable axis/facet labels
    // The categorical domain computation handles Date uniqueness by timestamp comparison
    const field = makeDiscreteTimelineField('ts');
    const colName = getResultColumnName(field); // should be ts_day_timeline
    expect(colName).toBe('ts_day_timeline');
    
    // Epoch values representing different days
    const day1 = 1703462400000; // 2023-12-25
    const day2 = 1703548800000; // 2023-12-26
    const rows = [
      { [colName]: day1, hour: 10 },
      { [colName]: day1, hour: 14 },
      { [colName]: day2, hour: 10 },
    ];

    const result = normalizeTimelineData(rows, [field]);

    // Values should be converted to Date objects
    expect(result[0][colName]).toBeInstanceOf(Date);
    expect(result[1][colName]).toBeInstanceOf(Date);
    expect(result[2][colName]).toBeInstanceOf(Date);
    // Same epoch should produce dates with same timestamp
    expect((result[0][colName] as Date).getTime()).toBe(day1);
    expect((result[1][colName] as Date).getTime()).toBe(day1);
    expect((result[2][colName] as Date).getTime()).toBe(day2);
  });

  it('should return original rows when no timeline fields present', () => {
    const field = makeNonTimelineField('name');
    const rows = [{ name: 'test', count: 5 }];

    const result = normalizeTimelineData(rows, [field]);

    expect(result).toBe(rows);
  });

  it('should handle null and undefined values gracefully', () => {
    const field = makeTimelineField('ts');
    const colName = getResultColumnName(field);
    const rows = [
      { [colName]: null, value: 1 },
      { [colName]: undefined, value: 2 },
      { [colName]: 1703548800000, value: 3 },
    ];

    const result = normalizeTimelineData(rows, [field]);

    expect(result[0][colName]).toBeNull();
    expect(result[1][colName]).toBeUndefined();
    expect(result[2][colName]).toBeInstanceOf(Date);
  });

  it('should handle microsecond epoch values', () => {
    const field = makeTimelineField('ts');
    const colName = getResultColumnName(field);
    // 1703548800 seconds = 1703548800000000 microseconds
    const epochUs = 1703548800000000;
    const rows = [{ [colName]: epochUs, value: 10 }];

    const result = normalizeTimelineData(rows, [field]);

    expect(result[0][colName]).toBeInstanceOf(Date);
    expect((result[0][colName] as Date).toISOString()).toBe('2023-12-26T00:00:00.000Z');
  });
});

