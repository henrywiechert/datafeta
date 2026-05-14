// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  buildAggregateSql,
  buildDuckDbDateTimePartExpr,
  buildDuckDbDateTimePartSelectItem,
  buildMeasureExpr,
  quoteIdent,
} from './localSqlBuilder';

describe('localSqlBuilder datetime parts (DuckDB)', () => {
  test('timeline minute uses date_trunc(minute, <ts>) and backend-compatible alias', () => {
    const item = buildDuckDbDateTimePartSelectItem({
      field: 'ts',
      datePart: 'minute',
      dateMode: 'timeline',
    });
    expect(item.kind).toBe('expr');
    if (item.kind !== 'expr') {
      throw new Error('Expected expr kind');
    }
    expect(item.alias).toBe('ts_minute_timeline');
    expect(item.expr).toContain("date_trunc('minute'");
  });

  test('distinct minute uses EXTRACT(MINUTE FROM <ts>)', () => {
    const expr = buildDuckDbDateTimePartExpr({
      field: 'ts',
      datePart: 'minute',
      dateMode: 'distinct',
    });
    expect(expr).toContain('EXTRACT(MINUTE FROM');
  });

  test('distinct weekday is ISO 1..7 using EXTRACT(DOW) normalization', () => {
    const expr = buildDuckDbDateTimePartExpr({
      field: 'ts',
      datePart: 'weekday',
      dateMode: 'distinct',
    });
    expect(expr).toContain('EXTRACT(DOW FROM');
    expect(expr).toContain('% 7');
    expect(expr).toContain('+ 1');
  });

  test('buildAggregateSql groups by computed datetime-part alias', () => {
    const dim = buildDuckDbDateTimePartSelectItem({
      field: 'ts',
      datePart: 'hour',
      dateMode: 'timeline',
    });
    const sql = buildAggregateSql({
      tableName: 'cache_table',
      dimensionSelectItems: [dim],
      measures: [{ field: 'value', aggregation: 'sum', alias: 'SUM(value)' }],
    });
    expect(sql).toContain('GROUP BY');
    expect(sql).toContain(quoteIdent('ts_hour_timeline'));
  });

  test('distinct millisecond uses modulo 1000 to get 0-999 range', () => {
    const expr = buildDuckDbDateTimePartExpr({
      field: 'ts',
      datePart: 'millisecond',
      dateMode: 'distinct',
    });
    // EXTRACT(MILLISECOND) in DuckDB returns 0-59999, so we need % 1000
    expect(expr).toContain('EXTRACT(MILLISECOND FROM');
    expect(expr).toContain('% 1000');
  });

  test('distinct microsecond uses modulo 1000000 to get 0-999999 range', () => {
    const expr = buildDuckDbDateTimePartExpr({
      field: 'ts',
      datePart: 'microsecond',
      dateMode: 'distinct',
    });
    // EXTRACT(MICROSECOND) in DuckDB returns full microseconds including seconds
    expect(expr).toContain('EXTRACT(MICROSECOND FROM');
    expect(expr).toContain('% 1000000');
  });
});

describe('buildMeasureExpr', () => {
  test('COUNT on a named field uses COUNT(field), not COUNT(*)', () => {
    const sql = buildMeasureExpr({
      field: 'dlFdSchedData.tbSize',
      aggregation: 'count',
      alias: 'COUNT(dlFdSchedData.tbSize)',
    });
    expect(sql).toBe('COUNT("dlFdSchedData.tbSize") AS "COUNT(dlFdSchedData.tbSize)"');
  });

  test('COUNT with wildcard field uses COUNT(*)', () => {
    const sql = buildMeasureExpr({ field: '*', aggregation: 'count', alias: 'COUNT(*)' });
    expect(sql).toBe('COUNT(*) AS "COUNT(*)"');
  });

  test('COUNT with empty field falls back to COUNT(*)', () => {
    const sql = buildMeasureExpr({ field: '', aggregation: 'count', alias: 'count_all' });
    expect(sql).toBe('COUNT(*) AS "count_all"');
  });

  test('SUM uses numeric expression', () => {
    const sql = buildMeasureExpr({
      field: 'value',
      aggregation: 'sum',
      alias: 'SUM(value)',
    });
    expect(sql).toContain('SUM(');
    expect(sql).toContain('AS "SUM(value)"');
  });

  test('COUNT_DISTINCT quotes the field', () => {
    const sql = buildMeasureExpr({
      field: 'dlFdSchedData.tbSize',
      aggregation: 'count_distinct',
      alias: 'COUNT_DISTINCT(dlFdSchedData.tbSize)',
    });
    expect(sql).toBe('COUNT(DISTINCT "dlFdSchedData.tbSize") AS "COUNT_DISTINCT(dlFdSchedData.tbSize)"');
  });
});


