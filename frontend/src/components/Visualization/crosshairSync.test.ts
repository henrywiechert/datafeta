// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { attachCrosshairSync, CrosshairSyncStore } from './crosshairSync';
import type { CrosshairSpec } from '../../observable-plot-generator/overlays/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const spec: CrosshairSpec = { xColumn: 'date', yColumn: 'sales', axes: 'both' };

// Linear scales over a 200x100 cell, standing in for Plot's exposed scales.
const linear = (domain: [number, number], range: [number, number]) => ({
  domain,
  range,
  apply: (v: number) => range[0] + ((v - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0]),
});

function makePlot(scales: Record<string, any> = { x: linear([0, 10], [0, 200]), y: linear([0, 100], [100, 0]) }) {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('width', '200');
  svg.setAttribute('height', '100');
  (svg as any).scale = (name: string) => scales[name];
  return svg;
}

const hover = (plot: any, d: any) => {
  plot.value = d;
  plot.dispatchEvent(new Event('input'));
};
const lines = (plot: Element) => Array.from(plot.querySelectorAll('.crosshair-sync line'))
  .map((l) => ['x1', 'y1', 'x2', 'y2'].map((a) => Number(l.getAttribute(a))));

describe('crosshair sync', () => {
  test('mirrors the hovered point as guide lines at the same data values in other cells', () => {
    const store = new CrosshairSyncStore();
    const a = makePlot();
    const b = makePlot({ x: linear([0, 10], [0, 200]), y: linear([0, 100], [100, 0]) });
    attachCrosshairSync(a, spec, store);
    attachCrosshairSync(b, spec, store);

    hover(a, { date: 5, sales: 25 });

    expect(lines(b)).toEqual([[100, 0, 100, 100], [0, 75, 200, 75]]);
    expect(lines(a)).toEqual([]);
  });

  test('removes the mirrored lines when the pointer leaves', () => {
    const store = new CrosshairSyncStore();
    const a = makePlot();
    const b = makePlot();
    attachCrosshairSync(a, spec, store);
    attachCrosshairSync(b, spec, store);

    hover(a, { date: 5, sales: 25 });
    hover(a, null);

    expect(lines(b)).toEqual([]);
  });

  test('a cell losing the pointer does not wipe the cell that took over', () => {
    const store = new CrosshairSyncStore();
    const a = makePlot();
    const b = makePlot();
    const c = makePlot();
    attachCrosshairSync(a, spec, store);
    attachCrosshairSync(b, spec, store);
    attachCrosshairSync(c, spec, store);

    hover(a, { date: 5, sales: 25 });
    hover(b, { date: 2, sales: 50 });
    hover(a, null);

    expect(lines(c)).toEqual([[40, 0, 40, 100], [0, 50, 200, 50]]);
    expect(lines(b)).toEqual([]);
  });

  test('only mirrors an axis the cell plots the same column on', () => {
    const store = new CrosshairSyncStore();
    const a = makePlot();
    const b = makePlot();
    attachCrosshairSync(a, spec, store);
    attachCrosshairSync(b, { ...spec, yColumn: 'profit' }, store);

    hover(a, { date: 5, sales: 25 });

    expect(lines(b)).toEqual([[100, 0, 100, 100]]);
  });

  test('draws only the vertical guide when the crosshair is vertical only', () => {
    const store = new CrosshairSyncStore();
    const a = makePlot();
    const b = makePlot();
    attachCrosshairSync(a, { ...spec, axes: 'x' }, store);
    attachCrosshairSync(b, { ...spec, axes: 'x' }, store);

    hover(a, { date: 5, sales: 25 });

    expect(lines(b)).toEqual([[100, 0, 100, 100]]);
  });

  test('skips values outside the cell\'s scale', () => {
    const store = new CrosshairSyncStore();
    const a = makePlot();
    const b = makePlot({ x: linear([0, 3], [0, 200]), y: linear([0, 100], [100, 0]) });
    attachCrosshairSync(a, spec, store);
    attachCrosshairSync(b, spec, store);

    hover(a, { date: 5, sales: 25 });

    expect(lines(b)).toEqual([[0, 75, 200, 75]]);
  });

  test('centres lines on band scale categories and skips unknown ones', () => {
    const band = {
      domain: ['A', 'B'],
      range: [0, 200],
      bandwidth: 80,
      apply: (v: string) => (v === 'A' ? 10 : 110),
    };
    const store = new CrosshairSyncStore();
    const a = makePlot();
    const b = makePlot({ x: band, y: linear([0, 100], [100, 0]) });
    attachCrosshairSync(a, spec, store);
    attachCrosshairSync(b, { ...spec }, store);

    hover(a, { date: 'B', sales: 25 });
    expect(lines(b)[0]).toEqual([150, 0, 150, 100]);

    hover(a, { date: 'Z', sales: 25 });
    expect(lines(b).some((l) => l[0] === l[2])).toBe(false);
  });

  test('cleanup unsubscribes the cell and clears its lines', () => {
    const store = new CrosshairSyncStore();
    const a = makePlot();
    const b = makePlot();
    attachCrosshairSync(a, spec, store);
    const detachB = attachCrosshairSync(b, spec, store);

    hover(a, { date: 5, sales: 25 });
    detachB();
    expect(lines(b)).toEqual([]);

    hover(a, { date: 6, sales: 30 });
    expect(lines(b)).toEqual([]);
  });

  describe('un-pinning on a click in another cell', () => {
    // jsdom has no PointerEvent
    class FakePointerEvent extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: any = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? '';
      }
    }
    const original = (global as any).PointerEvent;
    beforeAll(() => { (global as any).PointerEvent = FakePointerEvent; });
    afterAll(() => { (global as any).PointerEvent = original; });

    const press = (el: Element) => el.dispatchEvent(new FakePointerEvent('pointerdown', { pointerType: 'mouse' }));
    const spyOnPress = (el: Element) => {
      const spy = jest.fn();
      el.addEventListener('pointerdown', spy);
      return spy;
    };

    test('sends the pinned cell the click that releases its crosshair', () => {
      const store = new CrosshairSyncStore();
      const a = makePlot();
      const b = makePlot();
      attachCrosshairSync(a, spec, store);
      attachCrosshairSync(b, spec, store);
      const pressedA = spyOnPress(a);

      hover(a, { date: 5, sales: 25 });
      hover(b, { date: 2, sales: 50 });
      press(b);

      expect(pressedA).toHaveBeenCalledTimes(1);
    });

    test('leaves cells that are not pinned alone', () => {
      const store = new CrosshairSyncStore();
      const a = makePlot();
      const b = makePlot();
      attachCrosshairSync(a, spec, store);
      attachCrosshairSync(b, spec, store);
      const pressedA = spyOnPress(a);
      const pressedB = spyOnPress(b);

      hover(b, { date: 2, sales: 50 });
      press(b);

      expect(pressedA).not.toHaveBeenCalled();
      expect(pressedB).toHaveBeenCalledTimes(1);
    });
  });
});
