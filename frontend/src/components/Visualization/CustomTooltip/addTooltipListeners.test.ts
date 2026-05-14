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
});