// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { dropCollidingEndLabels, estimateGutterRatio } from './seriesEndLabels';

jest.mock('@observablehq/plot', () => ({
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
}));

describe('dropCollidingEndLabels', () => {
  const rowsFor = (values: number[]) => values.map((v, i) => ({ y: v, name: `s${i}` }));

  test('keeps well-separated labels', () => {
    const endRows = rowsFor([0, 50, 100]);
    const kept = dropCollidingEndLabels({
      endRows,
      dependentColumn: 'y',
      dependentDomain: [0, 100],
    });
    expect(kept).toHaveLength(3);
  });

  test('drops the lower of two labels closer than the separation threshold', () => {
    const endRows = rowsFor([0, 50, 50.5]);
    const kept = dropCollidingEndLabels({
      endRows,
      dependentColumn: 'y',
      dependentDomain: [0, 100],
    });
    expect(kept.map((r: any) => r.y)).toEqual([50.5, 0]);
  });

  test('falls back to the value extent when no domain is supplied', () => {
    const kept = dropCollidingEndLabels({
      endRows: rowsFor([10, 10.1, 20]),
      dependentColumn: 'y',
    });
    expect(kept.map((r: any) => r.y)).toEqual([20, 10.1]);
  });

  test('handles Date values on the dependent axis', () => {
    const endRows = [
      { y: new Date('2024-01-01') },
      { y: new Date('2024-06-01') },
    ];
    const kept = dropCollidingEndLabels({ endRows, dependentColumn: 'y' });
    expect(kept).toHaveLength(2);
  });

  test('ignores rows with no numeric dependent value', () => {
    const kept = dropCollidingEndLabels({
      endRows: [{ y: 10 }, { y: null }, { y: 90 }],
      dependentColumn: 'y',
    });
    expect(kept.map((r: any) => r.y)).toEqual([90, 10]);
  });

  test('collapses to a single label when every value is identical', () => {
    const kept = dropCollidingEndLabels({
      endRows: rowsFor([7, 7, 7]),
      dependentColumn: 'y',
    });
    expect(kept).toHaveLength(1);
  });

  test('passes through zero or one row unchanged', () => {
    expect(dropCollidingEndLabels({ endRows: [], dependentColumn: 'y' })).toEqual([]);
    const single = [{ y: 1 }];
    expect(dropCollidingEndLabels({ endRows: single, dependentColumn: 'y' })).toBe(single);
  });
});

describe('estimateGutterRatio', () => {
  test('is zero when there is nothing to label', () => {
    expect(estimateGutterRatio([])).toBe(0);
    expect(estimateGutterRatio([''])).toBe(0);
  });

  test('grows with the longest label', () => {
    const short = estimateGutterRatio(['AT']);
    const long = estimateGutterRatio(['AT', 'A considerably longer series name']);
    expect(long).toBeGreaterThan(short);
  });

  test('never eats more than a third of the axis', () => {
    expect(estimateGutterRatio(['x'.repeat(500)])).toBeLessThanOrEqual(0.33);
  });

  test('scales with font size', () => {
    expect(estimateGutterRatio(['Germany'], 22)).toBeGreaterThan(estimateGutterRatio(['Germany'], 8));
  });
});
