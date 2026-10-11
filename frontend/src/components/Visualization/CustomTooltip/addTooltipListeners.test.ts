// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent } from '@testing-library/react';

import { addTooltipListeners } from './addTooltipListeners';
import { CustomTooltipConfig } from '../../../types';

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
});