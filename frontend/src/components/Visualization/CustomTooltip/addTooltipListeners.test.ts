// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent } from '@testing-library/react';

import { addTooltipListeners } from './addTooltipListeners';
import { CustomTooltipConfig } from '../../../types';
import { RECT_HOVER_PROXY_CLASS } from '../../../observable-plot-generator/utils/tooltipUtils';

function buildPlot(markCount: number): { plot: SVGSVGElement; marks: SVGRectElement[] } {
  const plot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const marks: SVGRectElement[] = [];

  for (let index = 0; index < markCount; index += 1) {
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    mark.setAttribute('x', String(index));
    mark.setAttribute('y', '0');
    mark.setAttribute('width', '1');
    mark.setAttribute('height', '1');
    plot.appendChild(mark);
    marks.push(mark);
  }

  document.body.appendChild(plot);

  return { plot, marks };
}

describe('addTooltipListeners', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('clears only the tracked highlight when hovering between many marks', () => {
    const { plot, marks } = buildPlot(250);
    const config: CustomTooltipConfig = {
      enabled: true,
      data: marks.map((_, index) => ({ index })),
      getFields: (data) => [{ label: 'Index', value: String(data.index) }],
    };

    const removeSpies = marks.map((mark) => jest.spyOn(mark.classList, 'remove'));
    const cleanup = addTooltipListeners(
      plot,
      config,
      jest.fn(),
      jest.fn(),
      jest.fn(),
    );

    fireEvent.mouseEnter(marks[0], { clientX: 10, clientY: 20 });

    expect(removeSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(marks[0].classList.contains('chart-mark--highlighted')).toBe(true);

    fireEvent.mouseEnter(marks[1], { clientX: 30, clientY: 40 });

    const removeCallCount = removeSpies.reduce((total, spy) => total + spy.mock.calls.length, 0);

    expect(removeCallCount).toBe(1);
    expect(removeSpies[0]).toHaveBeenCalledWith('chart-mark--highlighted');
    expect(marks[0].classList.contains('chart-mark--highlighted')).toBe(false);
    expect(marks[1].classList.contains('chart-mark--highlighted')).toBe(true);

    cleanup();
  });

  it('skips decoration (overlay-no-tooltip) circles when resolving a transparent hover-dot colour', () => {
    const plot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    // A decoration circle (e.g. a Gantt snap-target dot) at the same position,
    // tagged on its wrapping group the way Observable Plot applies `className`.
    const decorationGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    decorationGroup.setAttribute('class', 'overlay-no-tooltip');
    const decorationCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    decorationCircle.setAttribute('cx', '10');
    decorationCircle.setAttribute('cy', '20');
    decorationCircle.setAttribute('fill', 'red');
    decorationGroup.appendChild(decorationCircle);
    plot.appendChild(decorationGroup);

    // The genuine visible mark at the same position (e.g. a tick-strip line's circle).
    const genuineCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    genuineCircle.setAttribute('cx', '10');
    genuineCircle.setAttribute('cy', '20');
    genuineCircle.setAttribute('fill', 'blue');
    plot.appendChild(genuineCircle);

    // The transparent hover-dot itself (the element the user actually hovers).
    const hoverDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hoverDot.setAttribute('cx', '10');
    hoverDot.setAttribute('cy', '20');
    hoverDot.setAttribute('fill', 'transparent');
    hoverDot.setAttribute('stroke', 'transparent');
    plot.appendChild(hoverDot);

    document.body.appendChild(plot);

    const showTooltip = jest.fn();
    // marks = [genuineCircle, hoverDot] after decoration exclusion — one data entry per mark.
    const config: CustomTooltipConfig = {
      enabled: true,
      data: [{ value: 1 }, { value: 1 }],
      getFields: (data) => [{ label: 'Value', value: String(data.value) }],
    };

    const cleanup = addTooltipListeners(plot, config, showTooltip, jest.fn(), jest.fn());

    fireEvent.mouseEnter(hoverDot, { clientX: 10, clientY: 20 });

    expect(showTooltip).toHaveBeenCalledWith(10, 20, expect.any(Array), 'blue', undefined);

    cleanup();
  });

  it('resolves row index 0 bound as __data__ even when the element is not the first mark', () => {
    // An unbound element (e.g. a background rect) precedes the dots, so element
    // position and row index differ. Plot binds each dot to its row index.
    const { plot } = buildPlot(1);
    const circles = [0, 1, 2].map((rowIndex) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      plot.appendChild(circle);
      (circle as any).__data__ = rowIndex;
      return circle;
    });

    const config: CustomTooltipConfig = {
      enabled: true,
      data: [{ name: 'first' }, { name: 'second' }, { name: 'third' }],
      getFields: (data) => [{ label: 'Name', value: data.name }],
    };
    const showTooltip = jest.fn();
    const cleanup = addTooltipListeners(plot, config, showTooltip, jest.fn(), jest.fn());

    fireEvent.mouseEnter(circles[0], { clientX: 1, clientY: 1 });
    expect(showTooltip).toHaveBeenLastCalledWith(1, 1, [{ label: 'Name', value: 'first' }], undefined, undefined);

    fireEvent.mouseEnter(circles[2], { clientX: 2, clientY: 2 });
    expect(showTooltip).toHaveBeenLastCalledWith(2, 2, [{ label: 'Name', value: 'third' }], undefined, undefined);

    cleanup();
  });

  it('highlights the bar bound to the same row when hovering a rect hover-proxy dot', () => {
    const { plot, marks: rects } = buildPlot(2);
    rects.forEach((rect, rowIndex) => {
      (rect as any).__data__ = rowIndex;
      rect.setAttribute('fill', rowIndex === 0 ? 'red' : 'blue');
    });
    const proxyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    proxyGroup.setAttribute('class', RECT_HOVER_PROXY_CLASS);
    plot.appendChild(proxyGroup);
    const circles = [0, 1].map((rowIndex) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('fill', 'transparent');
      circle.setAttribute('stroke', 'transparent');
      proxyGroup.appendChild(circle);
      (circle as any).__data__ = rowIndex;
      return circle;
    });

    const config: CustomTooltipConfig = {
      enabled: true,
      data: [{ name: 'first' }, { name: 'second' }],
      getFields: (data) => [{ label: 'Name', value: data.name }],
    };
    const showTooltip = jest.fn();
    const cleanup = addTooltipListeners(plot, config, showTooltip, jest.fn(), jest.fn());

    fireEvent.mouseEnter(circles[1], { clientX: 1, clientY: 1 });

    expect(rects[1].classList.contains('chart-mark--highlighted')).toBe(true);
    expect(circles[1].classList.contains('chart-mark--highlighted')).toBe(false);
    expect(showTooltip).toHaveBeenLastCalledWith(1, 1, [{ label: 'Name', value: 'second' }], 'blue', undefined);

    cleanup();
  });

  it('listens on the plot, not on each mark', () => {
    const { plot, marks } = buildPlot(50);
    const targets: EventTarget[] = [];
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, ...args: any[]) {
      targets.push(this);
      return (original as any).apply(this, args);
    };
    let cleanup: () => void;
    try {
      cleanup = addTooltipListeners(plot, { enabled: true, data: [], getFields: () => [] }, jest.fn(), jest.fn(), jest.fn());
    } finally {
      EventTarget.prototype.addEventListener = original;
    }

    // A dense scatter has ~80k marks; per-mark listeners cost every redraw.
    expect(targets.some((t) => marks.includes(t as SVGRectElement))).toBe(false);
    expect(targets).toContain(plot);
    cleanup();
  });

  it('hides when the pointer leaves a mark, and ignores grid and axis elements', () => {
    const { plot, marks } = buildPlot(2);
    marks.forEach((m, i) => { (m as any).__data__ = i; });
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    grid.setAttribute('aria-label', 'y-grid');
    const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    grid.appendChild(gridLine);
    plot.appendChild(grid);
    const config: CustomTooltipConfig = {
      enabled: true,
      data: [{ name: 'first' }, { name: 'second' }],
      getFields: (data) => [{ label: 'Name', value: data.name }],
    };
    const showTooltip = jest.fn();
    const hideTooltip = jest.fn();
    const cleanup = addTooltipListeners(plot, config, showTooltip, hideTooltip, jest.fn());

    fireEvent.mouseEnter(gridLine, { clientX: 1, clientY: 1 });
    expect(showTooltip).not.toHaveBeenCalled();

    fireEvent.mouseEnter(marks[1], { clientX: 1, clientY: 1 });
    expect(showTooltip).toHaveBeenCalledTimes(1);
    hideTooltip.mockClear();

    fireEvent.mouseLeave(marks[1], { clientX: 1, clientY: 1 });
    expect(hideTooltip).toHaveBeenCalledTimes(1);
    expect(marks[1].classList.contains('chart-mark--highlighted')).toBe(false);

    cleanup();
  });

  it('follows the pointer over a mark once per frame', () => {
    jest.useFakeTimers();
    const { plot, marks } = buildPlot(1);
    const updatePosition = jest.fn();
    const cleanup = addTooltipListeners(plot, { enabled: true, data: [{}], getFields: () => [] }, jest.fn(), jest.fn(), updatePosition);

    fireEvent.mouseMove(marks[0], { clientX: 5, clientY: 6 });
    fireEvent.mouseMove(marks[0], { clientX: 7, clientY: 8 });
    jest.runOnlyPendingTimers(); // jsdom's requestAnimationFrame runs on timers
    expect(updatePosition).toHaveBeenCalledTimes(1);
    expect(updatePosition).toHaveBeenCalledWith(7, 8);

    cleanup();
    jest.useRealTimers();
  });

  it('shows no tooltip while Alt is held, and hides a visible one when Alt is pressed', () => {
    const { plot, marks } = buildPlot(2);
    marks.forEach((m, i) => { (m as any).__data__ = i; });
    const config: CustomTooltipConfig = {
      enabled: true,
      data: [{ name: 'first' }, { name: 'second' }],
      getFields: (data) => [{ label: 'Name', value: data.name }],
    };
    const showTooltip = jest.fn();
    const hideTooltip = jest.fn();
    const cleanup = addTooltipListeners(plot, config, showTooltip, hideTooltip, jest.fn(), jest.fn(), jest.fn(), { current: false });

    fireEvent.mouseOver(marks[0], { clientX: 1, clientY: 1, altKey: true });
    expect(showTooltip).not.toHaveBeenCalled();

    fireEvent.mouseOver(marks[1], { clientX: 1, clientY: 1 });
    expect(showTooltip).toHaveBeenCalledTimes(1);
    hideTooltip.mockClear();

    fireEvent.keyDown(document, { key: 'Alt', altKey: true });
    expect(hideTooltip).toHaveBeenCalledTimes(1);
    expect(marks[1].classList.contains('chart-mark--highlighted')).toBe(false);

    cleanup();
  });

  it('pins on click without the document click handler hiding it', () => {
    const { plot, marks } = buildPlot(1);
    (marks[0] as any).__data__ = 0;
    const pinTooltip = jest.fn();
    const hideTooltip = jest.fn();
    const cleanup = addTooltipListeners(
      plot,
      { enabled: true, data: [{ name: 'only' }], getFields: (d) => [{ label: 'Name', value: d.name }] },
      jest.fn(), hideTooltip, jest.fn(), pinTooltip, jest.fn(), { current: false },
    );

    fireEvent.click(marks[0]);
    expect(pinTooltip).toHaveBeenCalledTimes(1);
    expect(hideTooltip).not.toHaveBeenCalled();

    cleanup();
  });
});

