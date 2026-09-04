// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { applyLineBudgetSql, applyPointBudgetSql } from './localSqlBuilder';

const BASE = 'SELECT "k" AS "k", SUM("v") AS "SUM(v)" FROM "t" GROUP BY "k"';

describe('preserve-extremes budget SQL', () => {
  it('evaluates the base query once', () => {
    const sql = applyLineBudgetSql(BASE, { maxRows: 5000, continuousFields: ['k'] });

    expect(sql.match(/GROUP BY/g)).toHaveLength(1);
    expect(sql).not.toContain('UNION ALL');
  });

  it('projects the helper rank columns away', () => {
    const sql = applyLineBudgetSql(BASE, { maxRows: 5000, continuousFields: ['k'] });

    expect(sql.startsWith('SELECT * EXCLUDE ("__rb_min_0", "__rb_max_0", "__rb_sample")')).toBe(true);
  });

  it('reserves sample slots for the extremes of every preserved field', () => {
    const sql = applyLineBudgetSql(BASE, { maxRows: 1000, continuousFields: ['k', 'SUM(v)'] });

    // 2 fields x (min + max) = 4 reserved rows.
    expect(sql).toContain('"__rb_sample" <= 996');
    expect(sql).toContain('"__rb_min_1"');
    expect(sql).toContain('"__rb_max_1"');
  });

  it('orders the result by the first preserved field', () => {
    const sql = applyLineBudgetSql(BASE, { maxRows: 5000, continuousFields: ['k'] });

    expect(sql.trimEnd().endsWith('ORDER BY "k" ASC')).toBe(true);
  });

  it('falls back to plain random sampling without continuous fields', () => {
    const sql = applyLineBudgetSql(BASE, { maxRows: 100, continuousFields: [] });

    expect(sql).toContain('ORDER BY random() LIMIT 100');
  });

  it('uses the same single-pass shape for the point budget', () => {
    const sql = applyPointBudgetSql(BASE, {
      maxRows: 5000,
      strategy: 'preserve_extremes',
      preserveFields: ['k'],
    });

    expect(sql).not.toContain('UNION ALL');
    expect(sql).toContain('row_number() OVER (ORDER BY "k" DESC) AS "__rb_max_0"');
  });
});

describe('stratified budget SQL', () => {
  const RAW = 'SELECT "cat" AS "cat", "v" AS "v" FROM "t"';

  it('never floors the per-stratum target at zero', () => {
    const sql = applyPointBudgetSql(RAW, {
      maxRows: 5000, strategy: 'stratified', stratifyField: 'cat', minPerStratum: 0,
    });

    expect(sql).toContain('greatest(1, cast(5000 * cat_cnt / total_cnt as integer))');
  });

  it('keeps an explicit min-per-stratum when it is higher', () => {
    const sql = applyPointBudgetSql(RAW, {
      maxRows: 5000, strategy: 'stratified', stratifyField: 'cat', minPerStratum: 200,
    });

    expect(sql).toContain('greatest(200, cast(5000 * cat_cnt / total_cnt as integer))');
  });
});
