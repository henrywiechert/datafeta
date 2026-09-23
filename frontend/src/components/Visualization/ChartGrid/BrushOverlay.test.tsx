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

function setup() {
  const onBrushEnd = jest.fn();
  const onPlotPointerDown = jest.fn();
  const utils = render(
    <BrushOverlay onBrushEnd={onBrushEnd}>
      <PlotLikeChild onPlotPointerDown={onPlotPointerDown} />
    </BrushOverlay>,
  );
  return { ...utils, onBrushEnd, onPlotPointerDown, plot: utils.getByTestId('plot') };
}

function drag(plot: HTMLElement, from: number, to: number, modifiers: { ctrlKey?: boolean }) {
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

    expect(onBrushEnd).toHaveBeenCalledWith({ axis: 'x', startPx: 100, endPx: 200 });
    // The brush claims the gesture, so the crosshair does not toggle sticky.
    expect(onPlotPointerDown).not.toHaveBeenCalled();
  });

  test('leaves plain clicks and drags to the chart', () => {
    const { plot, onBrushEnd, onPlotPointerDown } = setup();

    drag(plot, 100, 200, {});

    expect(onBrushEnd).not.toHaveBeenCalled();
    expect(onPlotPointerDown).toHaveBeenCalledTimes(1);
  });
});
