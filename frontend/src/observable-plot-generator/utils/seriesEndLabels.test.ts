// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { estimateGutterRatio } from './seriesEndLabels';

jest.mock('@observablehq/plot', () => ({
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
}));

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
