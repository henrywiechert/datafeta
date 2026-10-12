// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { axisPreviewTransform, liveAxisDomain, registerPreviewCell } from './useViewportPreview';
import { axisFrame } from './useViewportGestures';
import { createViewportController } from './viewportController';
import { applyChartViewport, declareViewportAxis } from '../../../../observable-plot-generator/viewport/chartViewport';

/** Where `v` lands on screen after the transform, for a [c0, c1] px axis drawn for `rendered`. */
function project(v: number, c0: number, c1: number, rendered: { min: number; max: number }, t: { scale: number; translate: number }) {
  const x = c0 + ((v - rendered.min) / (rendered.max - rendered.min)) * (c1 - c0);
  return t.translate + t.scale * x;
}

describe('axisPreviewTransform', () => {
  const rendered = { min: 0, max: 100 };

  test('places values where the live domain would draw them (x axis)', () => {
    const live = { min: 20, max: 40 };
    const t = axisPreviewTransform(0, 200, rendered, live);
    expect(project(20, 0, 200, rendered, t)).toBeCloseTo(0);
    expect(project(40, 0, 200, rendered, t)).toBeCloseTo(200);
    expect(project(30, 0, 200, rendered, t)).toBeCloseTo(100);
  });

  test('works for an inverted (y) pixel range', () => {
    const live = { min: 50, max: 100 };
    const t = axisPreviewTransform(100, 0, rendered, live);
    expect(project(50, 100, 0, rendered, t)).toBeCloseTo(100);
    expect(project(100, 100, 0, rendered, t)).toBeCloseTo(0);
  });

  test('is the identity when nothing changed', () => {
    expect(axisPreviewTransform(0, 200, rendered, rendered)).toEqual({ scale: 1, translate: 0 });
  });
});

describe('liveAxisDomain', () => {
  const options = (): any => {
    const o: any = { x: { domainKey: 'ts', domain: [new Date(0), new Date(1000)] } };
    declareViewportAxis(o, 'x', { column: 'ts', extent: [0, 1000], temporal: true });
    applyChartViewport([{ options: o }], { ts: { min: 100, max: 200 } });
    return o;
  };

  test('uses the live range, falling back to the natural domain once cleared', () => {
    const opts = options();
    const controller = createViewportController();
    controller.set({ ts: { min: 300, max: 400 } });
    expect(liveAxisDomain(opts, 'x', controller)).toEqual([new Date(300), new Date(400)]);

    controller.clear();
    expect(liveAxisDomain(opts, 'x', controller)).toEqual([new Date(0), new Date(1000)]);
    controller.dispose();
  });

  test('returns the options domain for undeclared axes', () => {
    const controller = createViewportController();
    expect(liveAxisDomain({ y: { domain: [1, 2] } } as any, 'y', controller)).toEqual([1, 2]);
  });
});

describe('registerPreviewCell', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('runs every cell read before any write, once per frame', () => {
    const controller = createViewportController();
    const log: string[] = [];
    const cell = (name: string) => ({
      measure: () => {
        log.push(`read ${name}`);
        return () => log.push(`write ${name}`);
      },
    });
    const offA = registerPreviewCell(controller, cell('a'));
    const offB = registerPreviewCell(controller, cell('b'));

    controller.set({ t: { min: 1, max: 2 } });
    controller.set({ t: { min: 2, max: 3 } });
    jest.runOnlyPendingTimers(); // jsdom's requestAnimationFrame runs on timers
    expect(log).toEqual(['read a', 'read b', 'write a', 'write b']);

    offA();
    offB();
    log.length = 0;
    controller.set({ t: { min: 3, max: 4 } });
    jest.runOnlyPendingTimers();
    expect(log).toEqual([]);
  });
});

describe('axisFrame', () => {
  test('ignores a CSS transform on the svg (live preview)', () => {
    const host = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    svg.setAttribute('width', '200');
    host.appendChild(svg);
    host.getBoundingClientRect = () => ({ left: 100, top: 0, width: 200, height: 100 } as DOMRect);
    // The transformed svg reports a scaled/shifted box; it must not be used.
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 100 } as DOMRect);
    (svg as any).scale = () => ({ range: [0, 200] });

    const frame = axisFrame(svg, 'x')!;
    expect(frame.scale).toBe(1);
    expect(frame.toSvg(150, 0)).toBe(50);
  });
});
