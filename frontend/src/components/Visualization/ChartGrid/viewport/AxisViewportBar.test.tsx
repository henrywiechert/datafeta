// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AxisViewportBar, { axisViewportWindow } from './AxisViewportBar';
import { createViewportController } from './viewportController';
import { applyChartViewport, declareViewportAxis } from '../../../../observable-plot-generator/viewport/chartViewport';

function makeOptions() {
  const options: any = { x: { domain: [0, 100] }, y: { domain: [0, 10] } };
  declareViewportAxis(options, 'x', { column: 't', extent: [0, 100] });
  declareViewportAxis(options, 'y', { column: 'v', extent: [0, 10] });
  applyChartViewport([{ options }], {});
  return options;
}

describe('axisViewportWindow', () => {
  it('is null while the axis shows its natural domain', () => {
    const controller = createViewportController(10);
    expect(axisViewportWindow(makeOptions(), 'x', controller)).toBeNull();
  });

  it('is null for an axis that was not declared', () => {
    const controller = createViewportController(10);
    controller.set({ t: { min: 10, max: 20 } });
    expect(axisViewportWindow({ x: { domain: [0, 1] } } as any, 'x', controller)).toBeNull();
  });

  it('gives the live range as fractions of the bounds', () => {
    const controller = createViewportController(10);
    controller.set({ t: { min: 25, max: 50 }, v: { min: 8, max: 10 } });
    const options = makeOptions();
    expect(axisViewportWindow(options, 'x', controller)).toEqual({ column: 't', start: 0.25, end: 0.5 });
    expect(axisViewportWindow(options, 'y', controller)).toEqual({ column: 'v', start: 0.8, end: 1 });
    controller.dispose();
  });
});

describe('AxisViewportBar', () => {
  it('renders only while zoomed and resets its axis on double-click', () => {
    const controller = createViewportController(10);
    const options = makeOptions();
    const { rerender } = render(<AxisViewportBar options={options} axis="x" controller={controller} />);
    expect(screen.queryByTestId('axis-viewport-bar-x')).toBeNull();

    act(() => controller.set({ t: { min: 25, max: 50 }, v: { min: 2, max: 4 } }));
    rerender(<AxisViewportBar options={options} axis="x" controller={controller} />);
    fireEvent.doubleClick(screen.getByTestId('axis-viewport-bar-x'));

    expect(controller.get('t')).toBeUndefined();
    expect(controller.get('v')).toEqual({ min: 2, max: 4 });
    controller.dispose();
  });
});
