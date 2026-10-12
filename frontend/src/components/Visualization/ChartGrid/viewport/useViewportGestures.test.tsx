// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef } from 'react';
import { act, render } from '@testing-library/react';
import { useViewportGestures } from './useViewportGestures';
import { createViewportController, ViewportController } from './viewportController';
import { applyChartViewport, declareViewportAxis } from '../../../../observable-plot-generator/viewport/chartViewport';

// jsdom has no PointerEvent; a MouseEvent with pointer fields is enough here.
if (typeof (window as any).PointerEvent === 'undefined') {
  class FakePointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: any = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  (window as any).PointerEvent = FakePointerEvent;
  (global as any).PointerEvent = FakePointerEvent;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A 200x100 px plot whose x axis maps [0, 100] onto [0, 200] px. */
function makePlotElement(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('width', '200');
  svg.setAttribute('height', '100');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  (svg as any).scale = (axis: 'x' | 'y') => (axis === 'x' ? { range: [0, 200] } : { range: [100, 0] });
  return svg;
}

function makeOptions() {
  const options: any = { x: { domainKey: 't', domain: [0, 100] } };
  declareViewportAxis(options, 'x', { column: 't', extent: [0, 100], temporal: false });
  applyChartViewport([{ options }], {});
  return options;
}

function Harness({ controller, plot }: { controller: ViewportController; plot: SVGSVGElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useViewportGestures({ wrapperRef: ref, options: makeOptions(), getPlotElement: () => plot, controller });
  return (
    <div ref={ref} data-testid="wrapper">
      <div data-testid="plot-host" ref={(el) => { if (el && !el.contains(plot)) el.appendChild(plot); }} />
    </div>
  );
}

function setup() {
  const controller = createViewportController(50);
  const plot = makePlotElement();
  const utils = render(<Harness controller={controller} plot={plot} />);
  return { ...utils, controller, plot };
}

const pointer = (type: string, init: Record<string, any> = {}) =>
  new (window as any).PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', ...init });

describe('useViewportGestures', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('alt+wheel zooms around the pointer and claims the event', () => {
    const { controller, plot } = setup();
    const wheel = new WheelEvent('wheel', { deltaY: -100, altKey: true, clientX: 50, bubbles: true, cancelable: true });
    act(() => { plot.dispatchEvent(wheel); });

    const range = controller.get('t')!;
    expect(wheel.defaultPrevented).toBe(true);
    expect(range.max - range.min).toBeCloseTo(100 * Math.exp(-0.2));
    // Pointer at 50px = value 25 stays at the same relative position.
    expect((25 - range.min) / (range.max - range.min)).toBeCloseTo(0.25);
  });

  test.each([
    ['plain wheel (scrolling)', {}],
    ['ctrl+mouse wheel (browser zoom)', { ctrlKey: true }],
  ])('%s is left to the browser', (_label, mods) => {
    const { controller, plot } = setup();
    const wheel = new WheelEvent('wheel', { deltaY: -100, clientX: 50, bubbles: true, cancelable: true, ...mods });
    act(() => { plot.dispatchEvent(wheel); });
    expect(wheel.defaultPrevented).toBe(false);
    expect(controller.get('t')).toBeUndefined();
  });

  test('a trackpad pinch (ctrl+wheel with fractional delta) zooms', () => {
    const { controller, plot } = setup();
    const wheel = new WheelEvent('wheel', { deltaY: -3.5, ctrlKey: true, clientX: 50, bubbles: true, cancelable: true });
    act(() => { plot.dispatchEvent(wheel); });
    expect(wheel.defaultPrevented).toBe(true);
    expect(controller.get('t')!.max - controller.get('t')!.min).toBeLessThan(100);
  });

  test('a drag pans after the threshold and swallows the closing click', () => {
    const { controller, plot } = setup();
    act(() => controller.set({ t: { min: 20, max: 40 } }));
    const onClick = jest.fn();
    plot.addEventListener('click', onClick);

    act(() => {
      plot.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      document.dispatchEvent(pointer('pointermove', { clientX: 102 }));
    });
    expect(controller.get('t')).toEqual({ min: 20, max: 40 });

    act(() => {
      document.dispatchEvent(pointer('pointermove', { clientX: 150 }));
      document.dispatchEvent(pointer('pointerup', { clientX: 150 }));
      plot.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // 50px of 200px over a 20-wide range: content follows the pointer.
    expect(controller.get('t')).toEqual({ min: 15, max: 35 });
    // pointerup flushes the commit without waiting for the idle timer
    expect(controller.getCommitted()).toEqual({ t: { min: 15, max: 35 } });
    expect(onClick).not.toHaveBeenCalled();

    act(() => { jest.runAllTimers(); });
    plot.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('a click without drag hands the withheld pointerdown to the plot', () => {
    const { plot } = setup();
    const onPointerDown = jest.fn();
    plot.addEventListener('pointerdown', onPointerDown);

    act(() => { plot.dispatchEvent(pointer('pointerdown', { clientX: 10 })); });
    expect(onPointerDown).not.toHaveBeenCalled();
    act(() => { document.dispatchEvent(pointer('pointerup', { clientX: 10 })); });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  test('modifier drags (brush / measure) are not intercepted', () => {
    const { plot } = setup();
    const onPointerDown = jest.fn();
    plot.addEventListener('pointerdown', onPointerDown);
    act(() => { plot.dispatchEvent(pointer('pointerdown', { clientX: 10, ctrlKey: true })); });
    act(() => { plot.dispatchEvent(pointer('pointerdown', { clientX: 10, altKey: true })); });
    expect(onPointerDown).toHaveBeenCalledTimes(2);
  });

  test('double-click resets the cell columns', () => {
    const { controller, plot } = setup();
    act(() => controller.set({ t: { min: 20, max: 40 } }));
    act(() => { plot.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(controller.get('t')).toBeUndefined();
    expect(controller.getCommitted()).toEqual({});
  });

});
