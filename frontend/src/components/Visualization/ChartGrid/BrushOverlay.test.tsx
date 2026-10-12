// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import BrushOverlay from './BrushOverlay';

/**
 * Stands in for an Observable Plot SVG with a pointer interaction (crosshair):
 * Plot's pointerdown handler calls stopImmediatePropagation whenever it is
 * pointing at a point, which kept the event from ever bubbling to the brush.
 */
const PlotLikeChild: React.FC<{ onPlotPointerDown: () => void }> = ({ onPlotPointerDown }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const handler = (e: Event) => { onPlotPointerDown(); e.stopImmediatePropagation(); };
    el.addEventListener('pointerdown', handler);
    return () => el.removeEventListener('pointerdown', handler);
  }, [onPlotPointerDown]);
  return <div ref={ref} data-testid="plot" style={{ width: 400, height: 200 }} />;
};

function setup(options?: { measureEnabled?: boolean; measureAxis?: 'x' | 'y'; onDragStart?: () => void }) {
  const onBrushEnd = jest.fn();
  const onPlotPointerDown = jest.fn();
  const utils = render(
    <BrushOverlay
      onBrushEnd={onBrushEnd}
      measureEnabled={options?.measureEnabled}
      measureAxis={options?.measureAxis}
      onDragStart={options?.onDragStart}
    >
      <PlotLikeChild onPlotPointerDown={onPlotPointerDown} />
    </BrushOverlay>,
  );
  return { ...utils, onBrushEnd, onPlotPointerDown, plot: utils.getByTestId('plot') };
}

function drag(plot: HTMLElement, from: number, to: number, modifiers: { ctrlKey?: boolean; altKey?: boolean }) {
  fireEvent.pointerDown(plot, { button: 0, clientX: from, clientY: 50, ...modifiers });
  fireEvent.pointerMove(document, { clientX: to, clientY: 52 });
  fireEvent.pointerUp(document, { clientX: to, clientY: 52 });
}

describe('BrushOverlay', () => {
  beforeAll(() => {
    // Ctrl is the brush modifier off macOS.
    Object.defineProperty(navigator, 'platform', { value: 'Linux x86_64', configurable: true });
  });

  test('brushes even when the chart swallows pointerdown (crosshair enabled)', () => {
    const { plot, onBrushEnd, onPlotPointerDown } = setup();

    drag(plot, 100, 200, { ctrlKey: true });

    expect(onBrushEnd).toHaveBeenCalledWith({
      axis: 'x', startPx: 100, endPx: 200, gesture: 'zoom',
      originAxisPx: 100, currentAxisPx: 200, originCrossAxisPx: 50, currentCrossAxisPx: 52,
    });
    // The brush claims the gesture, so the crosshair does not toggle sticky.
    expect(onPlotPointerDown).not.toHaveBeenCalled();
  });

  test('Alt/Option+drag reports a measure gesture when measureEnabled', () => {
    const { plot, onBrushEnd, onPlotPointerDown } = setup({ measureEnabled: true });

    drag(plot, 100, 200, { altKey: true });

    expect(onBrushEnd).toHaveBeenCalledWith({
      axis: 'x', startPx: 100, endPx: 200, gesture: 'measure',
      originAxisPx: 100, currentAxisPx: 200, originCrossAxisPx: 50, currentCrossAxisPx: 52,
    });
    expect(onPlotPointerDown).not.toHaveBeenCalled();
  });

  test('Alt/Option+drag is ignored when measureEnabled is not set (default)', () => {
    const { plot, onBrushEnd, onPlotPointerDown } = setup();

    drag(plot, 100, 200, { altKey: true });

    expect(onBrushEnd).not.toHaveBeenCalled();
    expect(onPlotPointerDown).toHaveBeenCalledTimes(1);
  });

  test('onDragStart fires when a new drag begins, for either gesture', () => {
    const onDragStart = jest.fn();
    const { plot } = setup({ measureEnabled: true, onDragStart });

    drag(plot, 100, 200, { ctrlKey: true });
    expect(onDragStart).toHaveBeenCalledTimes(1);

    drag(plot, 100, 200, { altKey: true });
    expect(onDragStart).toHaveBeenCalledTimes(2);
  });

  test('leaves plain clicks and drags to the chart', () => {
    const { plot, onBrushEnd, onPlotPointerDown } = setup();

    drag(plot, 100, 200, {});

    expect(onBrushEnd).not.toHaveBeenCalled();
    expect(onPlotPointerDown).toHaveBeenCalledTimes(1);
  });

  test('a measure drag locks to measureAxis whatever direction it starts in', () => {
    const { plot, onBrushEnd } = setup({ measureEnabled: true, measureAxis: 'x' });

    // Mostly vertical drag: would lock to 'y' without measureAxis.
    fireEvent.pointerDown(plot, { button: 0, clientX: 100, clientY: 50, altKey: true });
    fireEvent.pointerMove(document, { clientX: 110, clientY: 150 });
    fireEvent.pointerUp(document, { clientX: 110, clientY: 150 });

    expect(onBrushEnd).toHaveBeenCalledWith(expect.objectContaining({ axis: 'x', gesture: 'measure', startPx: 100, endPx: 110 }));
  });

  test('measureAxis does not constrain the zoom brush', () => {
    const { plot, onBrushEnd } = setup({ measureEnabled: true, measureAxis: 'x' });
    fireEvent.pointerDown(plot, { button: 0, clientX: 100, clientY: 50, ctrlKey: true });
    fireEvent.pointerMove(document, { clientX: 110, clientY: 150 });
    fireEvent.pointerUp(document, { clientX: 110, clientY: 150 });
    expect(onBrushEnd).toHaveBeenCalledWith(expect.objectContaining({ axis: 'y', gesture: 'zoom' }));
  });

  test('suppresses chart hover page-wide only while a measure drag is active', () => {
    const { plot } = setup({ measureEnabled: true, measureAxis: 'x' });
    const flag = () => document.documentElement.hasAttribute('data-chart-measuring');

    fireEvent.pointerDown(plot, { button: 0, clientX: 100, clientY: 50, altKey: true });
    expect(flag()).toBe(true);
    fireEvent.pointerMove(document, { clientX: 200, clientY: 52 });
    fireEvent.pointerUp(document, { clientX: 200, clientY: 52 });
    expect(flag()).toBe(false);

    fireEvent.pointerDown(plot, { button: 0, clientX: 100, clientY: 50, ctrlKey: true });
    expect(flag()).toBe(false);
    fireEvent.pointerUp(document, { clientX: 100, clientY: 50 });
  });
});
