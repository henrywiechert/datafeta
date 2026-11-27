// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { scatterChart } from './scatterChart';
import { epochUnitToPreciseDate } from '../../datetime/datetimeDisplayFormat';

jest.mock('@observablehq/plot', () => ({
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
}));

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ a: i, b: i * 2 }));
const dotData = (opts: any) => (opts.marks as any[])[0].data as any[];

describe('scatterChart viewport', () => {
  test('declares both continuous axes with their full-data domains', () => {
    const opts: any = scatterChart(rows(100), 'a', 'b');
    expect(opts.__viewport.x).toMatchObject({ column: 'a', extent: opts.x.domain, temporal: false });
    expect(opts.__viewport.y).toMatchObject({ column: 'b', extent: opts.y.domain, temporal: false });
  });

  test('does not declare discrete axes', () => {
    const data = [{ a: 'p', b: 1 }, { a: 'q', b: 2 }];
    const opts: any = scatterChart(data, 'a', 'b');
    expect(opts.__viewport.x).toBeUndefined();
    expect(opts.__viewport.y).toBeDefined();
  });

  test('culls points to the viewport plus half a span on each axis', () => {
    const opts: any = scatterChart(rows(100), 'a', 'b', {
      viewport: { a: { min: 40, max: 50 }, b: { min: 0, max: 200 } },
    });
    const as = dotData(opts).map((r) => r.a);
    // Viewport 40..50 plus half a span each side.
    expect(Math.min(...as)).toBe(35);
    expect(Math.max(...as)).toBe(55);
    // Domain is still the natural one; applyChartViewport sets the viewport later.
    expect(opts.__viewport.x.extent[1]).toBeGreaterThan(99);
  });

  test('samples deterministically above the point budget', () => {
    const big = rows(120_000);
    const first = dotData(scatterChart(big, 'a', 'b')).map((r) => r.a);
    const second = dotData(scatterChart(big, 'a', 'b')).map((r) => r.a);
    expect(first.length).toBe(100_000);
    expect(second).toEqual(first);
    // Input rows are not reordered in place.
    expect(big[0].a).toBe(0);
    expect(big[1].a).toBe(1);
  });
});

describe('scatterChart sub-millisecond time axis', () => {
  // 2023-11-14T22:13:20.123100Z and .123400Z: same millisecond, 300 µs apart.
  const US = 1_700_000_000_123_100;
  const data = [
    { ts: epochUnitToPreciseDate(US, 'us'), v: 5 },
    { ts: epochUnitToPreciseDate(US + 300, 'us'), v: 5 },
  ];

  test('keeps both points and a domain spanning their microseconds', () => {
    const opts: any = scatterChart(data, 'ts', 'v');
    expect(dotData(opts)).toHaveLength(2);
    expect(opts.x.type).toBe('utc');
    const [lo, hi] = opts.x.domain as Date[];
    expect(+lo).toBeLessThan(+data[0].ts!);
    expect(+hi).toBeGreaterThan(+data[1].ts!);
    expect(opts.__viewport.x.temporal).toBe(true);
    expect(opts.__viewport.x.extent[1] - opts.__viewport.x.extent[0]).toBeGreaterThan(0.3);
  });

  test('culls by microsecond position', () => {
    const t0 = +data[0].ts!;
    const opts: any = scatterChart(data, 'ts', 'v', {
      // 0.25-0.35 ms plus a half-span margin keeps 0.2-0.4 ms: only the second point.
      viewport: { ts: { min: t0 + 0.25, max: t0 + 0.35 } },
    });
    expect(dotData(opts).map((r) => +r.ts)).toEqual([+data[1].ts!]);
  });
});
