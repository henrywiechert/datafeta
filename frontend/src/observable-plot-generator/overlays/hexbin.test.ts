// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildHexbin, HEXBIN_OPACITY_SCALE } from './hexbin';
import { applyOverlays } from './index';
import { DEFAULT_OVERLAYS, OVERLAY_NO_HIGHLIGHT_CLASS, OverlayType } from './types';

// Plot is ESM and untransformed by CRA's jest config; record mark calls instead.
jest.mock('@observablehq/plot', () => {
  const mark = (type: string) => (data: any, opts: any) => ({ type, data, opts });
  return {
    dot: mark('dot'),
    hexbin: (outputs: any, inputs: any) => ({ outputs, inputs }),
    ruleY: mark('ruleY'), ruleX: mark('ruleX'), text: mark('text'),
  };
});

const rows = [{ x: 1, y: 2, g: 'A' }, { x: 3, y: 4, g: 'B' }];

describe('buildHexbin', () => {
  test('bins x/y and maps the count to opacity, not colour', () => {
    const mark = buildHexbin(rows, 'x', 'y', { binWidth: 30, color: '#123456' }, 'y') as any;

    expect(mark.type).toBe('dot');
    expect(mark.data).toBe(rows);
    expect(mark.opts.outputs.fillOpacity).toBe('count');
    expect(mark.opts.outputs.fill).toBeUndefined();
    expect(mark.opts.inputs).toMatchObject({ x: 'x', y: 'y', binWidth: 30, fill: '#123456', clip: true });
    expect(mark.opts.inputs.className).toContain(OVERLAY_NO_HIGHLIGHT_CLASS);
    expect(mark.opts.inputs.className).toContain('overlay-no-tooltip');
  });

  test('per group: colours each hexagon by its dominant group', () => {
    const mark = buildHexbin(rows, 'x', 'y', { perGroup: true }, 'y', 'g') as any;

    expect(mark.opts.outputs.fill).toBe('mode');
    expect(mark.opts.inputs.fill).toBe('g');
  });

  test('ignores per group without a colour column', () => {
    const mark = buildHexbin(rows, 'x', 'y', { perGroup: true, color: '#123456' }, 'y') as any;
    expect(mark.opts.inputs.fill).toBe('#123456');
  });

  test('titles each hexagon with its point count', () => {
    const mark = buildHexbin(rows, 'x', 'y', {}, 'y') as any;
    const { reduceIndex } = mark.opts.outputs.title;

    expect(reduceIndex([0])).toBe('1 point');
    expect(reduceIndex([0, 1, 2])).toBe('3 points');
  });
});

describe('applyOverlays with a hexbin', () => {
  const enable = (...types: OverlayType[]) =>
    DEFAULT_OVERLAYS.map((o) => (types.includes(o.type) ? { ...o, enabled: true } : o));
  const meta = (chartType: any) => ({ data: rows, xColumn: 'x', yColumn: 'y', chartType, orientation: 'y' as const });

  test('replaces the points and installs the opacity scale', () => {
    const result = applyOverlays({ marks: ['points'] } as any, enable('hexbin'), meta('scatter')) as any;

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0].opts.outputs.fillOpacity).toBe('count');
    expect(result.opacity).toEqual(HEXBIN_OPACITY_SCALE);
  });

  test('keeps an opacity scale the chart configured itself', () => {
    const own = { type: 'linear' };
    const result = applyOverlays({ marks: [], opacity: own } as any, enable('hexbin'), meta('scatter')) as any;
    expect(result.opacity).toBe(own);
  });

  test('keeps the points when "hide points" is off', () => {
    const overlays = enable('hexbin').map((o) => (o.type === 'hexbin' ? { ...o, hideSourceData: false } : o));
    const result = applyOverlays({ marks: ['points'] } as any, overlays, meta('scatter')) as any;
    expect(result.marks[0]).toBe('points');
  });

  // Regression: hide-source used to be decided from every enabled overlay, so
  // an enabled hexbin hid the bars of a bar chart showing reference lines.
  test('does not hide the marks of a chart it does not apply to', () => {
    const result = applyOverlays({ marks: ['bars'] } as any, enable('hexbin', 'referenceLines'), meta('bar')) as any;

    expect(result.marks[0]).toBe('bars');
    expect(result.opacity).toBeUndefined();
  });
});
