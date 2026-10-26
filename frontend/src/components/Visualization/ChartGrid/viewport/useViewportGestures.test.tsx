// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef } from 'react';
import { act, render } from '@testing-library/react';
import { useViewportGestures } from './useViewportGestures';
import AxisZoomGutter from './AxisZoomGutter';
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

function Harness({ controller, plot, independentDomains }: { controller: ViewportController; plot: SVGSVGElement; independentDomains?: { x?: boolean; y?: boolean } }) {
  const ref = useRef<HTMLDivElement>(null);
  useViewportGestures({ wrapperRef: ref, options: makeOptions(), getPlotElement: () => plot, controller, independentDomains });
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
  const wrapper = utils.getByTestId('wrapper');
  // pointerenter does not bubble: dispatch it on the cell itself.
  const hover = () => act(() => { wrapper.dispatchEvent(new (window as any).PointerEvent('pointerenter')); });
  const unhover = () => act(() => { wrapper.dispatchEvent(new (window as any).PointerEvent('pointerleave')); });
  return { ...utils, controller, plot, wrapper, hover, unhover };
}

const holdAlt = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true })); });
const releaseAlt = () => act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false })); });

const pointer = (type: string, init: Record<string, any> = {}) =>
  new (window as any).PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', ...init });

describe('useViewportGestures', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('alt+wheel zooms around the pointer and claims the event', () => {
    const { controller, plot, hover } = setup();
    hover();
    holdAlt();
    const wheel = new WheelEvent('wheel', { deltaY: -100, altKey: true, clientX: 50, bubbles: true, cancelable: true });
    act(() => { plot.dispatchEvent(wheel); });

    const range = controller.get('t')!;
    expect(wheel.defaultPrevented).toBe(true);
    expect(range.max - range.min).toBeCloseTo(100 * Math.exp(-0.2));
    // Pointer at 50px = value 25 stays at the same relative position.
    expect((25 - range.min) / (range.max - range.min)).toBeCloseTo(0.25);
  });

  describe('axis gutter zoom', () => {
    const gutter = (props: { axis?: 'x' | 'y'; independent?: boolean } = {}) => {
      const controller = createViewportController(50);
      const options = makeOptions();
      const utils = render(
        <AxisZoomGutter options={options} axis={props.axis ?? 'x'} controller={controller} independent={props.independent}>
          <span data-testid="tick" />
        </AxisZoomGutter>,
      );
      const el = utils.container.firstElementChild as HTMLElement;
      // A 200x40 px gutter at the origin.
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40, x: 0, y: 0, toJSON: () => ({}) });
      act(() => { el.dispatchEvent(new (window as any).PointerEvent('pointerenter')); });
      holdAlt();
      const wheel = (init: Record<string, any>) => {
        const e = new WheelEvent('wheel', { deltaY: -100, altKey: true, bubbles: true, cancelable: true, ...init });
        act(() => { utils.getByTestId('tick').dispatchEvent(e); });
        return e;
      };
      return { controller, wheel };
    };

    test('alt+wheel over the x gutter zooms x around the pointer', () => {
      const { controller, wheel } = gutter();
      const e = wheel({ clientX: 50 });
      const range = controller.get('t')!;
      expect(e.defaultPrevented).toBe(true);
      expect(range.max - range.min).toBeCloseTo(100 * Math.exp(-0.2));
      expect((25 - range.min) / (range.max - range.min)).toBeCloseTo(0.25);
    });

    test('plain wheel over the gutter is left alone', () => {
      const { controller, wheel } = gutter();
      const e = wheel({ clientX: 50, altKey: false });
      expect(e.defaultPrevented).toBe(false);
      expect(controller.get('t')).toBeUndefined();
    });

    test('an independent axis does not zoom', () => {
      const { controller, wheel } = gutter({ independent: true });
      const e = wheel({ clientX: 50 });
      expect(e.defaultPrevented).toBe(true);
      expect(controller.get('t')).toBeUndefined();
    });
  });

  test.each([
    ['plain wheel (scrolling)', {}],
    ['ctrl+mouse wheel (browser zoom)', { ctrlKey: true }],
    // Browsers scale deltas by the page zoom, so a notch at 110% is fractional
    ['ctrl+wheel with fractional delta (page zoom / trackpad pinch)', { ctrlKey: true, deltaY: -90.909 }],
  ])('%s is left to the browser', (_label, mods) => {
    const { controller, plot, hover } = setup();
    hover();
    const wheel = new WheelEvent('wheel', { deltaY: -100, clientX: 50, bubbles: true, cancelable: true, ...mods });
    act(() => { plot.dispatchEvent(wheel); });
    expect(wheel.defaultPrevented).toBe(false);
    expect(controller.get('t')).toBeUndefined();
  });

  test('alt+wheel is claimed only while the cell is hovered, without a wheel listener on the cell', () => {
    // Record which element each listener lands on (jest 27 mocks don't keep `this`).
    const registered: Array<[EventTarget, string]> = [];
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest: any[]) {
      registered.push([this, type]);
      return (original as any).call(this, type, ...rest);
    };
    let setupResult: ReturnType<typeof setup>;
    try {
      setupResult = setup();
    } finally {
      EventTarget.prototype.addEventListener = original;
    }
    const { controller, plot, wrapper, hover, unhover } = setupResult;
    // A non-passive wheel listener on an element makes Chrome track every mark painted inside it.
    const wheelOnCell = registered.some(([el, type]) => el === wrapper && type === 'wheel');
    expect(wheelOnCell).toBe(false);

    const altWheel = () => {
      const wheel = new WheelEvent('wheel', { deltaY: -100, altKey: true, clientX: 50, bubbles: true, cancelable: true });
      act(() => { plot.dispatchEvent(wheel); });
      return wheel.defaultPrevented;
    };
    holdAlt();
    expect(altWheel()).toBe(false);
    expect(controller.get('t')).toBeUndefined();

    hover();
    holdAlt();
    expect(altWheel()).toBe(true);
    expect(controller.get('t')).toBeDefined();

    unhover();
    expect(altWheel()).toBe(false);
  });

  test('a blocking wheel listener exists only while a hovered cell has the zoom modifier held', () => {
    // Any non-passive wheel listener, even on document, makes Chrome track every mark painted under it.
    const blocking = new Set<unknown>();
    const add = jest.spyOn(document, 'addEventListener').mockImplementation(function (this: Document, type: string, listener: any, opts?: any) {
      if (type === 'wheel' && opts?.passive === false) blocking.add(listener);
      return EventTarget.prototype.addEventListener.call(this, type, listener, opts);
    });
    const remove = jest.spyOn(document, 'removeEventListener').mockImplementation(function (this: Document, type: string, listener: any, opts?: any) {
      if (type === 'wheel') blocking.delete(listener);
      return EventTarget.prototype.removeEventListener.call(this, type, listener, opts);
    });
    try {
      const { plot, hover, unhover } = setup();
      hover();
      expect(blocking.size).toBe(0);
      holdAlt();
      expect(blocking.size).toBe(1);
      releaseAlt();
      expect(blocking.size).toBe(0);
      // Modifier flags of pointer events count too (no keyboard focus needed).
      act(() => { plot.dispatchEvent(pointer('pointermove', { altKey: true })); });
      expect(blocking.size).toBe(1);
      unhover();
      expect(blocking.size).toBe(0);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  test('an unclaimed alt+wheel claims the notches after it', () => {
    const { controller, plot, hover } = setup();
    hover();
    const altWheel = () => {
      const wheel = new WheelEvent('wheel', { deltaY: -100, altKey: true, clientX: 50, bubbles: true, cancelable: true });
      act(() => { plot.dispatchEvent(wheel); });
      return wheel.defaultPrevented;
    };
    expect(altWheel()).toBe(false);
    expect(controller.get('t')).toBeUndefined();
    expect(altWheel()).toBe(true);
    expect(controller.get('t')).toBeDefined();
  });

  test('alt+wheel over an independent axis explains why it does not zoom', () => {
    const controller = createViewportController(50);
    const plot = makePlotElement();
    const utils = render(<Harness controller={controller} plot={plot} independentDomains={{ x: true }} />);
    const wrapper = utils.getByTestId('wrapper');
    act(() => { wrapper.dispatchEvent(new (window as any).PointerEvent('pointerenter', { altKey: true })); });

    const wheel = new WheelEvent('wheel', { deltaY: -100, altKey: true, clientX: 50, bubbles: true, cancelable: true });
    act(() => { plot.dispatchEvent(wheel); });

    expect(wheel.defaultPrevented).toBe(true);
    expect(controller.get('t')).toBeUndefined();
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(/X axis is independent per facet/);
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

  test('a paused drag commits once, on release', () => {
    const { controller, plot } = setup();
    const onCommit = jest.fn();
    controller.subscribeCommitted(onCommit);

    act(() => {
      plot.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      document.dispatchEvent(pointer('pointermove', { clientX: 150 }));
    });
    // Holding still for longer than the idle time must not redraw mid-drag.
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(pointer('pointermove', { clientX: 160 }));
      document.dispatchEvent(pointer('pointerup', { clientX: 160 }));
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  test('a pan blocks text selection without restyling <body>', () => {
    const { plot } = setup();
    const selectStart = () => {
      const ev = new Event('selectstart', { bubbles: true, cancelable: true });
      plot.dispatchEvent(ev);
      return ev.defaultPrevented;
    };

    act(() => {
      plot.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      document.dispatchEvent(pointer('pointermove', { clientX: 150 }));
    });
    expect(selectStart()).toBe(true);
    expect(document.body.style.userSelect).toBe('');

    act(() => { document.dispatchEvent(pointer('pointerup', { clientX: 150 })); });
    expect(selectStart()).toBe(false);
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
