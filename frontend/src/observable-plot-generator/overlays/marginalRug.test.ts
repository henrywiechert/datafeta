// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildMarginalRug, RUG_THIN_THRESHOLD, selectRugRows } from './marginalRug';
import { applyOverlays } from './index';
import { DEFAULT_OVERLAYS } from './types';

// Plot is ESM and untransformed by CRA's jest config; record mark calls instead.
jest.mock('@observablehq/plot', () => {
  const mark = (type: string) => (data: any, opts: any) => ({ type, data, opts });
  return {
    dot: mark('dot'),
    lineY: mark('lineY'), lineX: mark('lineX'), windowY: (_: any, o: any) => o, windowX: (_: any, o: any) => o,
    linearRegressionY: mark('linearRegressionY'), linearRegressionX: mark('linearRegressionX'),
    density: mark('density'), ruleY: mark('ruleY'), ruleX: mark('ruleX'), text: mark('text'),
  };
});

const rows = [
  { x: 1, y: 10, g: 'A' },
  { x: 2, y: 20, g: 'B' },
  { x: 3, y: null, g: 'A' },
];

describe('selectRugRows', () => {
  test('keeps every row with a finite numeric or time value', () => {
    expect(selectRugRows(rows, 'y')).toEqual(new Set([rows[0], rows[1]]));
    const times = [{ t: new Date(0) }, { t: new Date(NaN) }];
    expect(selectRugRows(times, 't')).toEqual(new Set([times[0]]));
  });

  test('returns null for a non-continuous column', () => {
    expect(selectRugRows([{ c: 'a' }, { c: 'b' }], 'c')).toBeNull();
  });

  test('thins large inputs to one row per value bin, per group', () => {
    const many = Array.from({ length: RUG_THIN_THRESHOLD * 2 }, (_, i) => ({ v: i % 10, g: i % 2 ? 'A' : 'B' }));

    expect(selectRugRows(many, 'v')!.size).toBe(10);
    // v and g are both determined by i's parity, so each value has one group.
    expect(selectRugRows(many, 'v', 'g')!.size).toBe(10);

    const mixed = many.map((r, i) => ({ ...r, g: i % 3 }));
    expect(selectRugRows(mixed, 'v', 'g')!.size).toBe(30);
  });
});

describe('buildMarginalRug', () => {
  const build = (params: any, colorColumn?: string) =>
    buildMarginalRug(rows, 'x', 'y', params, 'y', colorColumn) as any[];

  test('draws an x rug on the bottom edge and a y rug on the left edge', () => {
    const [x, y] = build({ rugAxes: 'both', rugLength: 10, color: '#123456' });

    expect(x.type).toBe('dot');
    expect(x.opts).toMatchObject({ x: 'x', frameAnchor: 'bottom', r: 5, stroke: '#123456', fill: 'none' });
    expect(x.opts.y).toBeUndefined();
    expect(y.opts).toMatchObject({ y: 'y', frameAnchor: 'left' });
    expect(x.opts.className).toContain('overlay-no-tooltip');
  });

  test('binds the full array and filters, keeping element indices valid', () => {
    const [x, y] = build({});

    expect(x.data).toBe(rows);
    expect(x.opts.filter).toBeUndefined();
    expect(y.data).toBe(rows);
    expect(rows.filter(y.opts.filter)).toEqual([rows[0], rows[1]]);
  });

  test('draws only the requested axis', () => {
    expect(build({ rugAxes: 'x' }).map((m) => m.opts.frameAnchor)).toEqual(['bottom']);
    expect(build({ rugAxes: 'y' }).map((m) => m.opts.frameAnchor)).toEqual(['left']);
  });

  test('colours by group only when per group is on and a colour column exists', () => {
    expect(build({ perGroup: true }, 'g')[0].opts.stroke).toBe('g');
    expect(build({ perGroup: true, color: '#123456' })[0].opts.stroke).toBe('#123456');
    expect(build({ perGroup: false, color: '#123456' }, 'g')[0].opts.stroke).toBe('#123456');
  });

  test('draws a segment of twice the radius into the frame', () => {
    const [x, y] = build({});
    const record = () => {
      const calls: any[] = [];
      return { calls, ctx: { moveTo: (...a: number[]) => calls.push(['M', ...a]), lineTo: (...a: number[]) => calls.push(['L', ...a]) } };
    };
    const r = 4;
    const xs = record();
    x.opts.symbol.draw(xs.ctx, r * r * Math.PI);
    expect(xs.calls).toEqual([['M', 0, 0], ['L', 0, -8]]);
    const ys = record();
    y.opts.symbol.draw(ys.ctx, r * r * Math.PI);
    expect(ys.calls[1][1]).toBeCloseTo(8);
  });
});

describe('applyOverlays with a marginal rug', () => {
  const overlays = DEFAULT_OVERLAYS.map((o) => (o.type === 'marginalRug' ? { ...o, enabled: true } : o));

  test('binds the rows the chart renders, not the raw cell data', () => {
    const rendered = [{ x: 1, y: 2 }];
    const options: any = { marks: ['points'], __customTooltip: { data: rendered } };

    const result = applyOverlays(options, overlays, {
      data: [{ x: 5, y: 6 }, { x: 7, y: 8 }],
      xColumn: 'x',
      yColumn: 'y',
      chartType: 'scatter',
      orientation: 'y',
    }) as any;

    const rugs = result.marks.flat().filter((m: any) => m.type === 'dot');
    expect(rugs).toHaveLength(2);
    expect(rugs.every((m: any) => m.data === rendered)).toBe(true);
  });

  test('is not offered on chart types it does not apply to', () => {
    const options: any = { marks: ['bars'] };
    const result = applyOverlays(options, overlays, {
      data: [{ x: 1, y: 2 }], xColumn: 'x', yColumn: 'y', chartType: 'bar', orientation: 'y',
    });
    expect(result).toBe(options);
  });
});
