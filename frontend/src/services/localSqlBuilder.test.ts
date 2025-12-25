import {
  buildAggregateSql,
  buildDuckDbDateTimePartExpr,
  buildDuckDbDateTimePartSelectItem,
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
    if (item.kind === 'expr') {
      expect(item.alias).toBe('ts_minute_timeline');
      expect(item.expr).toContain("date_trunc('minute'");
      expect(item.expr).toContain(quoteIdent('ts'));
    }
  });

  test('distinct minute uses EXTRACT(MINUTE FROM <ts>)', () => {
    const expr = buildDuckDbDateTimePartExpr({
      field: 'ts',
      datePart: 'minute',
      dateMode: 'distinct',
    });
    expect(expr).toContain('EXTRACT(MINUTE FROM');
    expect(expr).toContain(quoteIdent('ts'));
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
});


