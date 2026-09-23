// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildReferenceLines, computeReferenceRows } from './referenceLines';
import { DEFAULT_OVERLAYS, normalizePercentile, OverlayConfig, REFERENCE_LINE_CLASS, withAllOverlays } from './types';

// Plot is ESM and untransformed by CRA's jest config; record mark calls instead.
jest.mock('@observablehq/plot', () => ({
  ruleY: (data: any, opts: any) => ({ type: 'ruleY', data, opts }),
  ruleX: (data: any, opts: any) => ({ type: 'ruleX', data, opts }),
  text: (data: any, opts: any) => ({ type: 'text', data, opts }),
}));

const rows = [1, 2, 3, 4, 10].map((v, i) => ({ x: i, v, g: i < 3 ? 'A' : 'B' }));

const values = (r: any[]) => r.map((row) => row.__refValue);
const labels = (r: any[]) => r.map((row) => row.__refLabel);

describe('computeReferenceRows', () => {
  test('computes each selected statistic once, in a stable order', () => {
    const { stats, fixed } = computeReferenceRows(rows, 'v', {
      refStats: ['max', 'mean', 'min', 'median', 'percentile'],
      percentile: 75,
    });

    expect(values(stats)).toEqual([1, 3, 4, 4, 10]);
    expect(labels(stats)).toEqual(['Min 1', 'Median 3', 'Mean 4', 'P75 4', 'Max 10']);
    expect(fixed).toEqual([]);
  });

  test('interpolates percentiles between samples', () => {
    const { stats } = computeReferenceRows(rows, 'v', { refStats: ['percentile'], percentile: 90 });
    // (5 - 1) * 0.9 = 3.6 → 4 + 0.6 * (10 - 4)
    expect(values(stats)[0]).toBeCloseTo(7.6);
  });

  test('computes statistics per group when a group column is given', () => {
    const { stats } = computeReferenceRows(rows, 'v', { refStats: ['mean'] }, 'g');

    expect(stats.map((r) => [r.g, r.__refValue])).toEqual([['A', 2], ['B', 7]]);
  });

  test('adds an ungrouped fixed value line', () => {
    const { stats, fixed } = computeReferenceRows(rows, 'v', { refStats: [], refValue: 2500 }, 'g');

    expect(stats).toEqual([]);
    expect(fixed).toEqual([{ __refValue: 2500, __refLabel: '2.5K' }]);
  });

  test('ignores non-finite values and empty data', () => {
    const messy = [{ v: 2 }, { v: null }, { v: NaN }, { v: 'x' }, { v: 4 }];
    expect(values(computeReferenceRows(messy, 'v', { refStats: ['mean'] }).stats)).toEqual([3]);
    expect(computeReferenceRows([], 'v', { refStats: ['mean'] }).stats).toEqual([]);
  });

  test('keeps a time axis on Dates and ignores a numeric fixed value there', () => {
    const times = [0, 1000, 2000].map((t) => ({ t: new Date(t) }));
    const { stats, fixed } = computeReferenceRows(times, 't', { refStats: ['median'], refValue: 5 });

    expect(stats[0].__refValue).toEqual(new Date(1000));
    expect(fixed).toEqual([]);
  });

  test('leaves label text empty when labels are off', () => {
    const { stats } = computeReferenceRows(rows, 'v', { refStats: ['mean'], showLabels: false });
    expect(labels(stats)).toEqual(['']);
  });
});

describe('buildReferenceLines', () => {
  const build = (params: any, orientation: 'x' | 'y' = 'y', colorColumn?: string) =>
    buildReferenceLines(rows, 'x', 'v', params, orientation, colorColumn) as any[];

  test('draws nothing when no statistic or value is selected', () => {
    expect(build({ refStats: [] })).toEqual([]);
  });

  test('draws dashed, clipped rules on the value axis with labels at the right edge', () => {
    const [rule, text] = build({ refStats: ['mean', 'max'], color: '#123456' });

    expect(rule.type).toBe('ruleY');
    expect(rule.opts).toMatchObject({ y: '__refValue', stroke: '#123456', clip: true });
    expect(rule.opts.strokeDasharray).toBeDefined();
    expect(rule.opts.className).toContain(REFERENCE_LINE_CLASS);
    expect(rule.opts.className).toContain('overlay-no-tooltip');

    expect(text.type).toBe('text');
    expect(text.opts).toMatchObject({ y: '__refValue', frameAnchor: 'right', textAnchor: 'end' });
    // Picked up by the renderer's label de-overlap pass.
    expect(text.opts.className).toContain('series-end-label-dodge-y');
  });

  test('uses vertical rules when the value axis is x', () => {
    const [rule, text] = build({ refStats: ['mean'] }, 'x');

    expect(rule.type).toBe('ruleX');
    expect(rule.opts.x).toBe('__refValue');
    expect(text.opts.frameAnchor).toBe('top');
    expect(text.opts.className).toContain('series-end-label-dodge-x');
  });

  test('keeps stat and fixed labels in one mark so they de-overlap together', () => {
    const marks = build({ refStats: ['mean'], refValue: 3 });
    const texts = marks.filter((m) => m.type === 'text');

    expect(texts).toHaveLength(1);
    expect(texts[0].data).toHaveLength(2);
  });

  test('per group: stats follow the colour scale, the fixed line keeps the overlay colour', () => {
    const marks = build({ refStats: ['mean'], refValue: 3, perGroup: true, color: '#123456' }, 'y', 'g');
    const rules = marks.filter((m) => m.type === 'ruleY');

    expect(rules.map((m) => m.opts.stroke)).toEqual(['g', '#123456']);
    expect(rules[0].data).toHaveLength(2);
  });

  test('ignores per group without a colour column', () => {
    const [rule] = build({ refStats: ['mean'], perGroup: true, color: '#123456' });
    expect(rule.opts.stroke).toBe('#123456');
    expect(rule.data).toHaveLength(1);
  });

  test('omits the label mark when labels are off', () => {
    expect(build({ refStats: ['mean'], showLabels: false }).map((m) => m.type)).toEqual(['ruleY']);
  });
});

describe('normalizePercentile', () => {
  test('defaults, clamps and rounds', () => {
    expect(normalizePercentile(undefined)).toBe(95);
    expect(normalizePercentile(150)).toBe(100);
    expect(normalizePercentile(-3)).toBe(0.1);
    expect(normalizePercentile(99.94)).toBe(99.9);
  });
});

describe('withAllOverlays', () => {
  test('adds overlay types missing from a saved state, keeping saved entries', () => {
    const saved: OverlayConfig[] = [{ type: 'linearRegression', enabled: true, params: { ci: 0.9 } }];

    const merged = withAllOverlays(saved);

    expect(merged[0]).toBe(saved[0]);
    expect(merged.map((o) => o.type).sort()).toEqual(DEFAULT_OVERLAYS.map((o) => o.type).sort());
  });

  test('returns the same array when nothing is missing', () => {
    expect(withAllOverlays(DEFAULT_OVERLAYS)).toBe(DEFAULT_OVERLAYS);
  });
});
