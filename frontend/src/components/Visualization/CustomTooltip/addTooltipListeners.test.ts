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

  it('pins tooltip on mark click', () => {
    const { plot, marks } = buildPlot(1);
    const config: CustomTooltipConfig = {
      enabled: true,
      data: [{ index: 0 }],
      getFields: (data) => [{ label: 'Index', value: String(data.index) }],
    };

    const showAndPinTooltip = jest.fn();
    const pinnedRef = { current: false };

    const cleanup = addTooltipListeners(
      plot,
      config,
      jest.fn(),
      jest.fn(),
      jest.fn(),
      jest.fn(),
      showAndPinTooltip,
      jest.fn(),
      pinnedRef,
    );

    fireEvent.click(marks[0], { clientX: 10, clientY: 20 });

    expect(showAndPinTooltip).toHaveBeenCalledTimes(1);
    expect(showAndPinTooltip).toHaveBeenCalledWith(
      10,
      20,
      [{ label: 'Index', value: '0' }],
      undefined,
      undefined,
    );

    cleanup();
  });

  it('does not unpin twice when clicking a data mark while pinned', () => {
    const { plot, marks } = buildPlot(1);
    (marks[0] as any).__data__ = { index: 0 };
    const config: CustomTooltipConfig = {
      enabled: true,
      data: [{ index: 0 }],
      getFields: (data) => [{ label: 'Index', value: String(data.index) }],
    };

    const pinnedRef = { current: true };
    const unpinTooltip = jest.fn(() => {
      pinnedRef.current = false;
    });
    const showAndPinTooltip = jest.fn(() => {
      pinnedRef.current = true;
    });

    const cleanup = addTooltipListeners(
      plot,
      config,
      jest.fn(),
      jest.fn(),
      jest.fn(),
      jest.fn(),
      showAndPinTooltip,
      unpinTooltip,
      pinnedRef,
    );

    fireEvent.click(marks[0], { clientX: 10, clientY: 20 });

    // Mark handler may unpin once while switching; document handler must not add another.
    expect(unpinTooltip).toHaveBeenCalledTimes(1);

    cleanup();
  });
});