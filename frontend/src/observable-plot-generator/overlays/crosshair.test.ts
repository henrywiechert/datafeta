// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildCrosshair } from './crosshair';
import { OVERLAY_NO_HIGHLIGHT_CLASS } from './types';

// Plot is ESM and untransformed by CRA's jest config; record mark calls instead.
jest.mock('@observablehq/plot', () => {
  const mark = (type: string) => (data: any, opts: any) => ({ type, data, opts });
  const pointer = (kind: string) => (opts: any) => ({ ...opts, __pointer: kind });
  return {
    ruleX: mark('ruleX'), ruleY: mark('ruleY'), dot: mark('dot'), text: mark('text'),
    pointer: pointer('xy'), pointerX: pointer('x'), pointerY: pointer('y'),
  };
});

const rows = [{ x: 1, y: 2500 }, { x: 2, y: 10 }];
const build = (params: any) => buildCrosshair(rows, 'x', 'y', params) as any[];

describe('buildCrosshair', () => {
  test('draws both guides, a ring and both axis labels, all following the nearest point', () => {
    const marks = build({});

    expect(marks.map((m) => m.type)).toEqual(['ruleX', 'ruleY', 'dot', 'text', 'text']);
    for (const m of marks) {
      expect(m.data).toBe(rows);
      expect(m.opts.__pointer).toBe('xy');
      expect(m.opts).toMatchObject({ px: 'x', py: 'y', pointerEvents: 'none' });
      expect(m.opts.className).toContain(OVERLAY_NO_HIGHLIGHT_CLASS);
      expect(m.opts.className).toContain('overlay-no-tooltip');
    }
  });

  test('labels values inside the frame edges, formatted like the axes', () => {
    const [, , , xLabel, yLabel] = build({});

    expect(xLabel.opts).toMatchObject({ x: 'x', frameAnchor: 'bottom', lineAnchor: 'bottom' });
    expect(xLabel.opts.dy).toBeLessThan(0);
    expect(yLabel.opts).toMatchObject({ y: 'y', frameAnchor: 'left', textAnchor: 'start' });
    expect(yLabel.opts.dx).toBeGreaterThan(0);
    expect(yLabel.opts.text(rows[0])).toBe('2.5K');
  });

  test('vertical only snaps by x and draws no horizontal parts', () => {
    const marks = build({ crosshairAxes: 'x' });

    expect(marks.map((m) => m.type)).toEqual(['ruleX', 'dot', 'text']);
    expect(marks.every((m) => m.opts.__pointer === 'x')).toBe(true);
    expect(marks[2].opts.frameAnchor).toBe('bottom');
  });

  test('horizontal only snaps by y', () => {
    const marks = build({ crosshairAxes: 'y' });

    expect(marks.map((m) => m.type)).toEqual(['ruleY', 'dot', 'text']);
    expect(marks.every((m) => m.opts.__pointer === 'y')).toBe(true);
  });

  test('omits labels when axis values are off', () => {
    expect(build({ showLabels: false }).map((m) => m.type)).toEqual(['ruleX', 'ruleY', 'dot']);
  });
});
