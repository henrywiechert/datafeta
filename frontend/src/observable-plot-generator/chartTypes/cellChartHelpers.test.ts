// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { aggregateValues } from './cellChartHelpers';

// cellChartHelpers pulls in Observable Plot (ESM); aggregateValues itself does
// not touch it, so the module is stubbed the way the other chart tests do.
jest.mock('@observablehq/plot', () => ({}));

const rows = (...values: any[]) => values.map((v) => ({ m: v }));

describe('aggregateValues', () => {
  test('empty input yields 0', () => {
    expect(aggregateValues([], 'm', 'sum')).toBe(0);
    expect(aggregateValues(rows(null, undefined, 'x'), 'm', 'sum')).toBe(0);
  });

  test.each([
    ['sum', 10],
    ['count', 10],
    ['count_distinct', 10],
    ['min', 1],
    ['max', 4],
    ['avg', 2.5],
  ])('%s rolls up per-group values', (aggregation, expected) => {
    expect(aggregateValues(rows(1, 2, 3, 4), 'm', aggregation)).toBe(expected);
  });

  test('a missing aggregation defaults to SUM', () => {
    expect(aggregateValues(rows(1, 2), 'm')).toBe(3);
  });

  test.each(['arg_max', 'arg_min', 'median'])(
    '%s cannot be rolled up and yields NaN rather than a sum',
    (aggregation) => {
      // Previously these fell through to SUM, reporting e.g. 10 as "the latest
      // value" across four rows. NaN is skipped by Plot instead.
      expect(aggregateValues(rows(1, 2, 3, 4), 'm', aggregation)).toBeNaN();
    }
  );

  test('a single row is passed through for any aggregation', () => {
    // One row is already at the requested grain, so no combining is needed and
    // even a non-roll-uppable aggregation is exact.
    expect(aggregateValues(rows(7), 'm', 'arg_max')).toBe(7);
    expect(aggregateValues(rows(7), 'm', 'avg')).toBe(7);
  });

  test('non-finite values are ignored before combining', () => {
    expect(aggregateValues(rows(1, NaN, Infinity, 3), 'm', 'sum')).toBe(4);
  });
});
