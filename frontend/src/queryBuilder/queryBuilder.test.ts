// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildQuery, convertFilterConfigsToFilters } from './queryBuilder';
import { Field, FilterConfig } from '../types';

const field = (columnName: string, overrides?: Partial<Field>): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
});

describe('convertFilterConfigsToFilters', () => {
  // A datetime range filter must carry a date_mode, or the backend skips datetime
  // handling entirely — including parsing a text-stored column into a timestamp.
  // The SELECT would then compare a parsed timestamp while the WHERE compares the
  // raw source string.
  const dateTimeRange = (overrides?: Partial<FilterConfig>): Record<string, FilterConfig> => ({
    ts: {
      fieldId: 'ts',
      columnName: 'ts',
      type: 'datetime',
      startDate: '2024-01-01 00:00:00.000',
      endDate: '2024-01-05 00:00:00.000',
      ...overrides,
    } as FilterConfig,
  });

  test('sends date_mode for an unconfigured datetime range filter', () => {
    const filters = convertFilterConfigsToFilters(dateTimeRange());

    expect(filters).toHaveLength(2);
    for (const f of filters) {
      expect(f.date_mode).toBe('timeline');
      expect(f.date_part).toBeUndefined();
    }
  });

  test('sends date_mode for an explicit Full DateTime range filter', () => {
    const filters = convertFilterConfigsToFilters(dateTimeRange({ dateTimeMode: 'timeline' }));

    expect(filters.map((f) => f.date_mode)).toEqual(['timeline', 'timeline']);
    expect(filters.every((f) => f.date_part === undefined)).toBe(true);
  });

  test('sends nothing for a timeline-PART range filter', () => {
    // Deliberate: date_part here would wrap the column in date_trunc() inside the
    // WHERE clause and change what the range means. Locks the non-change so a
    // future "consistency" cleanup cannot silently flip range semantics.
    const filters = convertFilterConfigsToFilters(
      dateTimeRange({ dateTimePart: 'day', dateTimeMode: 'timeline' }),
    );

    for (const f of filters) {
      expect(f.date_part).toBeUndefined();
      expect(f.date_mode).toBeUndefined();
    }
  });

  test('sends both part and mode for a distinct-part discrete filter', () => {
    const filters = convertFilterConfigsToFilters({
      ts: {
        fieldId: 'ts',
        columnName: 'ts',
        type: 'discrete',
        selectedValues: [14],
        dateTimePart: 'hour',
        dateTimeMode: 'distinct',
      } as FilterConfig,
    });

    expect(filters[0].date_part).toBe('hour');
    expect(filters[0].date_mode).toBe('distinct');
  });

  test('sends no datetime info for a non-datetime filter', () => {
    const filters = convertFilterConfigsToFilters({
      category: {
        fieldId: 'category',
        columnName: 'category',
        type: 'discrete',
        selectedValues: ['a'],
      } as FilterConfig,
    });

    expect(filters[0].date_part).toBeUndefined();
    expect(filters[0].date_mode).toBeUndefined();
  });

  test('converts discrete pattern mode to a like filter', () => {
    const filters = convertFilterConfigsToFilters({
      category: {
        fieldId: 'category',
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '%abc%',
        patternOperator: 'like',
        selectedValues: [],
      } satisfies FilterConfig,
    });

    expect(filters).toEqual([
      {
        field: 'category',
        operator: 'like',
        value: '%abc%',
      },
    ]);
  });

  test('converts discrete pattern mode to an ilike filter', () => {
    const filters = convertFilterConfigsToFilters({
      category: {
        fieldId: 'category',
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '%AbC%',
        patternOperator: 'ilike',
        selectedValues: [],
      } satisfies FilterConfig,
    });

    expect(filters).toEqual([
      {
        field: 'category',
        operator: 'ilike',
        value: '%AbC%',
      },
    ]);
  });

  test('converts inverse discrete pattern mode to a not like filter', () => {
    const filters = convertFilterConfigsToFilters({
      category: {
        fieldId: 'category',
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '%abc%',
        patternOperator: 'like',
        isInversePattern: true,
        selectedValues: [],
      } satisfies FilterConfig,
    });

    expect(filters).toEqual([
      {
        field: 'category',
        operator: 'not like',
        value: '%abc%',
      },
    ]);
  });

  test('continuous zoom on datetime distinct includes date_part and date_mode', () => {
    const filters = convertFilterConfigsToFilters({
      dt: {
        fieldId: 'dt',
        columnName: 'dt',
        type: 'continuous',
        min: 1900,
        max: 2010,
        isZoomFilter: true,
        dateTimePart: 'year',
        dateTimeMode: 'distinct',
      } satisfies FilterConfig,
    });

    expect(filters).toEqual([
      {
        field: 'dt',
        operator: '>=',
        value: 1900,
        date_part: 'year',
        date_mode: 'distinct',
      },
      {
        field: 'dt',
        operator: '<=',
        value: 2010,
        date_part: 'year',
        date_mode: 'distinct',
      },
    ]);
  });

  test('skips discrete pattern mode when the pattern is empty', () => {
    const filters = convertFilterConfigsToFilters({
      category: {
        fieldId: 'category',
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '   ',
        patternOperator: 'like',
        selectedValues: [],
      } satisfies FilterConfig,
    });

    expect(filters).toEqual([]);
  });
});

describe('buildQuery', () => {
  test('uses planned aggregated query mode even when fields would otherwise infer raw', () => {
    const sales = field('sales', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
    });

    const query = buildQuery({
      fields: [sales],
      selectedTable: 'orders',
      queryMode: 'aggregated',
    });

    expect(query?.dimensions).toEqual([]);
    expect(query?.measures).toEqual([
      { field: 'sales', aggregation: 'sum', alias: 'sales' },
    ]);
  });
});