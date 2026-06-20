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