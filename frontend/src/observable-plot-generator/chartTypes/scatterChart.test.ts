// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { scatterChart } from './scatterChart';

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
