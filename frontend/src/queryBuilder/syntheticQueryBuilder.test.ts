// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { transformMeasuresToRows } from './syntheticQueryBuilder';
import { Field, QueryResult } from '../types';

jest.mock('../apiService', () => ({ apiService: {} }));

const field = (overrides: Partial<Field>): Field => ({
  id: 'id',
  columnName: 'col',
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
  ...overrides,
});

describe('transformMeasuresToRows', () => {
  const region = field({ id: 'd1', columnName: 'region', type: 'dimension', flavour: 'discrete', dataType: 'string' });
  const measureValues = field({
    id: 'mv',
    columnName: 'MeasureValues',
    aggregation: 'sum',
    isSynthetic: true,
    syntheticType: 'MeasureValues',
  });

  it('unpivots per-member aggregations with qualified labels for duplicate columns', () => {
    const sumSales = field({ id: 'a', columnName: 'sales', aggregation: 'sum' });
    const avgSales = field({ id: 'b', columnName: 'sales', aggregation: 'avg' });

    const wide: QueryResult = {
      columns: [
        { name: 'region', type: 'string' },
        { name: 'SUM(sales)', type: 'float' },
        { name: 'AVG(sales)', type: 'float' },
      ],
      rows: [{ region: 'EU', 'SUM(sales)': 100, 'AVG(sales)': 25 }],
      row_count: 1,
    };

    const result = transformMeasuresToRows(wide, [sumSales, avgSales], [region, measureValues], new Set());

    expect(result.rows).toEqual([
      { region: 'EU', MeasureNames: 'SUM(sales)', 'SUM(MeasureValues)': 100 },
      { region: 'EU', MeasureNames: 'AVG(sales)', 'SUM(MeasureValues)': 25 },
    ]);
    expect(result.columns.map((c) => c.name)).toEqual(['region', 'MeasureNames', 'SUM(MeasureValues)']);
  });

  it('uses plain column names when columns are unique in the group', () => {
    const sales = field({ id: 'a', columnName: 'sales', aggregation: 'sum' });
    const profit = field({ id: 'b', columnName: 'profit', aggregation: 'avg' });

    const wide: QueryResult = {
      columns: [
        { name: 'region', type: 'string' },
        { name: 'SUM(sales)', type: 'float' },
        { name: 'AVG(profit)', type: 'float' },
      ],
      rows: [{ region: 'EU', 'SUM(sales)': 100, 'AVG(profit)': 25 }],
      row_count: 1,
    };

    const result = transformMeasuresToRows(wide, [sales, profit], [region, measureValues], new Set());

    expect(result.rows.map((r) => r.MeasureNames)).toEqual(['sales', 'profit']);
  });
});
