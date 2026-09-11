// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  AGGREGATIONS,
  AGGREGATION_NAMES,
  Aggregation,
  aggregationAliasPrefix,
  aggregationLabel,
  canComputeLocally,
  getAggregationSpec,
  isAggregation,
  menuAggregations,
} from './index';

describe('aggregation registry', () => {
  test('every entry is fully specified', () => {
    for (const name of AGGREGATION_NAMES) {
      const spec = AGGREGATIONS[name];
      expect(spec.label).toBeTruthy();
      expect(spec.aliasPrefix).toBe(spec.aliasPrefix.toUpperCase());
    }
  });

  test('an aggregation that cannot be rolled up also cannot be built locally', () => {
    // Both hold for the same reason: the ordering column is not in the cached
    // slice. If they ever diverge, the orchestrator's force-to-backend guard
    // and the local SQL builder disagree about what is computable.
    for (const name of AGGREGATION_NAMES) {
      const spec = AGGREGATIONS[name];
      if (spec.needsOrderingColumn) {
        expect(spec.localSql).toBeNull();
        expect(spec.rollup).toBeNull();
      }
    }
  });

  test('unknown names are rejected rather than resolved', () => {
    expect(isAggregation('stddev')).toBe(false);
    expect(getAggregationSpec('stddev')).toBeUndefined();
    expect(getAggregationSpec(undefined)).toBeUndefined();
    expect(canComputeLocally('stddev')).toBe(false);
  });

  test('median is registered', () => {
    expect(isAggregation('median')).toBe(true);
    expect(canComputeLocally('median')).toBe(true);
    // A median of per-group medians is not the median.
    expect(AGGREGATIONS.median.rollup).toBeNull();
    // MEDIAN of a datetime column is still a timestamp.
    expect(AGGREGATIONS.median.preservesColumnType).toBe(true);
  });
});

describe('menuAggregations', () => {
  test('numeric fields get the full plain list, in menu order', () => {
    expect(menuAggregations(true)).toEqual([
      'sum',
      'avg',
      'median',
      'min',
      'max',
      'count',
      'count_distinct',
    ]);
  });

  test('non-numeric fields drop the aggregations that need numbers', () => {
    // Median included: per the product decision it is numeric-only.
    expect(menuAggregations(false)).toEqual(['min', 'max', 'count', 'count_distinct']);
  });

  test('ordering-column aggregations are never in the plain list', () => {
    // They are offered through a dedicated "Latest/Earliest value by …" submenu,
    // because they are meaningless without a chosen ordering column.
    for (const isNumeric of [true, false]) {
      expect(menuAggregations(isNumeric)).not.toContain('arg_max');
      expect(menuAggregations(isNumeric)).not.toContain('arg_min');
    }
  });
});

describe('labels and aliases', () => {
  test.each<[Aggregation, string, string]>([
    ['sum', 'sum', 'SUM'],
    ['count_distinct', 'count_distinct', 'COUNT_DISTINCT'],
    ['arg_max', 'latest', 'LATEST'],
    ['arg_min', 'earliest', 'EARLIEST'],
  ])('%s displays as "%s" and aliases as %s(...)', (name, label, prefix) => {
    expect(aggregationLabel(name)).toBe(label);
    expect(aggregationAliasPrefix(name)).toBe(prefix);
  });

  test('an unregistered name still yields a usable alias', () => {
    // Result columns are parsed by alias elsewhere; degrading to the uppercased
    // name keeps a stale saved config readable instead of throwing while rendering.
    expect(aggregationAliasPrefix('stddev')).toBe('STDDEV');
    expect(aggregationLabel('stddev')).toBe('stddev');
  });
});

describe('roll-up exactness', () => {
  test.each<[Aggregation, boolean]>([
    ['sum', true],
    ['count', true],
    ['min', true],
    ['max', true],
    // Averaging averages ignores group sizes.
    ['avg', false],
    // Distinct counts double-count values shared between groups.
    ['count_distinct', false],
  ])('%s roll-up exact=%s', (name, exact) => {
    expect(AGGREGATIONS[name].rollup?.exact).toBe(exact);
  });

  test('combine functions match their aggregation', () => {
    const values = [1, 2, 3, 4];
    expect(AGGREGATIONS.sum.rollup.combine(values)).toBe(10);
    expect(AGGREGATIONS.count.rollup.combine(values)).toBe(10);
    expect(AGGREGATIONS.min.rollup.combine(values)).toBe(1);
    expect(AGGREGATIONS.max.rollup.combine(values)).toBe(4);
    expect(AGGREGATIONS.avg.rollup.combine(values)).toBe(2.5);
  });
});

describe('local SQL', () => {
  const col = { raw: '"v"', numeric: 'CAST("v" AS DOUBLE)' };

  test.each<[Aggregation, string]>([
    ['sum', 'SUM(CAST("v" AS DOUBLE))'],
    ['avg', 'AVG(CAST("v" AS DOUBLE))'],
    ['min', 'MIN(CAST("v" AS DOUBLE))'],
    ['max', 'MAX(CAST("v" AS DOUBLE))'],
    // Counting does not need the value parsed as a number.
    ['count', 'COUNT("v")'],
    ['count_distinct', 'COUNT(DISTINCT "v")'],
    // Guarded, matching the backend: an unfiltered NaN sorts highest and shifts
    // the median (median of [1,2,3,NaN] reads 2.5 instead of 2.0).
    [
      'median',
      'quantile_cont(CAST("v" AS DOUBLE), 0.5) FILTER (WHERE isFinite(CAST("v" AS DOUBLE)))',
    ],
  ])('%s renders %s', (name, expected) => {
    const { localSql } = AGGREGATIONS[name];
    if (!localSql) throw new Error(`${name} should be locally computable`);
    expect(localSql(col)).toBe(expected);
  });

  test('arg_max/arg_min are marked backend-only', () => {
    expect(canComputeLocally('arg_max')).toBe(false);
    expect(canComputeLocally('arg_min')).toBe(false);
    expect(canComputeLocally('sum')).toBe(true);
  });
});
