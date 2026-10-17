// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook, fireEvent } from '@testing-library/react';
import { useGanttMeasurement } from './useGanttMeasurement';
import { GANTT_EDGE_DOT_START_CLASS, GANTT_EDGE_DOT_END_CLASS } from '../../../../observable-plot-generator/chartTypes/ganttEdgeDotClasses';
import { Field } from '../../../../types';
import { BrushResult } from '../BrushOverlay';

function buildFakePlotElement(positions: Array<{ cls: string; cx: number; cy: number }>): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const { cls, cx, cy } of positions) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `${cls} overlay-no-tooltip`);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    g.appendChild(circle);
    svg.appendChild(g);
  }
  (svg as any).scale = (axis: 'x' | 'y') => (axis === 'x' ? { domain: [0, 1000], range: [0, 100] } : undefined);
  document.body.appendChild(svg);
  jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  return svg;
}

/** Builds a BrushResult, defaulting both endpoints to row (cross-axis) 50 so they land on the single test row. */
function brush(args: {
  originAxisPx: number;
  currentAxisPx: number;
  originCrossAxisPx?: number;
  currentCrossAxisPx?: number;
  gesture?: 'measure' | 'zoom';
}): BrushResult {
  const originCrossAxisPx = args.originCrossAxisPx ?? 50;
  const currentCrossAxisPx = args.currentCrossAxisPx ?? 50;
  return {
    axis: 'x',
    startPx: Math.min(args.originAxisPx, args.currentAxisPx),
    endPx: Math.max(args.originAxisPx, args.currentAxisPx),
    gesture: args.gesture ?? 'measure',
    originAxisPx: args.originAxisPx,
    currentAxisPx: args.currentAxisPx,
    originCrossAxisPx,
    currentCrossAxisPx,
  };
}

const field: Field = {
  id: 'f1',
  columnName: 'start_date',
  type: 'dimension',
  flavour: 'continuous',
  dataType: 'datetime',
};

describe('useGanttMeasurement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  function setup(positions: Array<{ cls: string; cx: number; cy: number }>) {
    const el = buildFakePlotElement(positions);
    const { result } = renderHook(() =>
      useGanttMeasurement({ isGanttChart: true, getPlotElement: () => el, xField: field, yField: undefined }),
    );
    return { el, result };
  }

  it('live-updates the measurement on every onBrushMove, then finalizes on onBrushEnd', () => {
    const { result } = setup([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10, cy: 50 },
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 80, cy: 50 },
    ]);

    expect(result.current.measurement).toBeNull();

    act(() => result.current.onBrushMove(brush({ originAxisPx: 12, currentAxisPx: 40 })));
    expect(result.current.measurement?.leftPx).toBe(10);
    // 40 is >14px from both dots (10 and 80) — free-floating, not forced onto either.
    expect(result.current.measurement?.rightPx).toBe(40);
    expect(result.current.measurement?.rightSnapped).toBe(false);

    act(() => result.current.onBrushMove(brush({ originAxisPx: 12, currentAxisPx: 78 })));
    expect(result.current.measurement?.rightPx).toBe(80);

    act(() => result.current.onBrushEnd(brush({ originAxisPx: 12, currentAxisPx: 78 })));
    expect(result.current.measurement?.leftPx).toBe(10);
    expect(result.current.measurement?.rightPx).toBe(80);
    expect(result.current.measurement?.leftSnapped).toBe(true);
    expect(result.current.measurement?.rightSnapped).toBe(true);
  });

  it('is free-floating (not snapped) when the pointer is far from any edge', () => {
    const { result } = setup([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10, cy: 50 },
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 80, cy: 50 },
    ]);

    act(() => result.current.onBrushMove(brush({ originAxisPx: 12, currentAxisPx: 45 })));
    // 45 is >14px from both 10 and 80 within the row — free floating, raw position shown.
    expect(result.current.measurement?.rightPx).toBe(45);
    expect(result.current.measurement?.rightSnapped).toBe(false);
  });

  it('never snaps to a dot in a different row, even if horizontally closer', () => {
    const { result } = setup([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10, cy: 50 },  // row A
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 19, cy: 300 },   // row B — numerically closer to 12, but a different row
    ]);

    // Pointer stays in row A (crossAxis 50) throughout.
    act(() => result.current.onBrushMove(brush({ originAxisPx: 8, currentAxisPx: 12 })));

    expect(result.current.measurement?.rightPx).toBe(10); // snapped to row A's dot, not row B's closer-but-wrong-row dot
    expect(result.current.measurement?.rightSnapped).toBe(true);
  });

  it('ignores zoom-gesture brush events entirely', () => {
    const { result } = setup([{ cls: GANTT_EDGE_DOT_START_CLASS, cx: 10, cy: 50 }]);

    act(() => result.current.onBrushMove(brush({ originAxisPx: 12, currentAxisPx: 40, gesture: 'zoom' })));
    expect(result.current.measurement).toBeNull();

    act(() => result.current.onBrushEnd(brush({ originAxisPx: 12, currentAxisPx: 40, gesture: 'zoom' })));
    expect(result.current.measurement).toBeNull();
  });

  it('onDragStart clears an existing measurement', () => {
    const { result } = setup([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10, cy: 50 },
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 80, cy: 50 },
    ]);
    act(() => result.current.onBrushEnd(brush({ originAxisPx: 12, currentAxisPx: 78 })));
    expect(result.current.measurement).not.toBeNull();

    act(() => result.current.onDragStart());
    expect(result.current.measurement).toBeNull();
  });

  it('onCellClick clears the measurement, but not the click immediately after creating it', () => {
    const { result } = setup([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10, cy: 50 },
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 80, cy: 50 },
    ]);
    act(() => result.current.onBrushEnd(brush({ originAxisPx: 12, currentAxisPx: 78 })));
    expect(result.current.measurement).not.toBeNull();

    // The click that naturally follows the drag's pointerup shouldn't dismiss it.
    act(() => result.current.onCellClick());
    expect(result.current.measurement).not.toBeNull();

    // A genuine subsequent click does dismiss it.
    act(() => result.current.onCellClick());
    expect(result.current.measurement).toBeNull();
  });

  it('Escape clears an active measurement', () => {
    const { result } = setup([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10, cy: 50 },
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 80, cy: 50 },
    ]);
    act(() => result.current.onBrushEnd(brush({ originAxisPx: 12, currentAxisPx: 78 })));
    expect(result.current.measurement).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result.current.measurement).toBeNull();
  });

  it('dragging a grip re-anchors only that end, snapping live, keeping the other end fixed', () => {
    const { result } = setup([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10, cy: 50 },
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 80, cy: 50 },
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 50, cy: 50 },
    ]);
    act(() => result.current.onBrushEnd(brush({ originAxisPx: 12, currentAxisPx: 78 })));
    expect(result.current.measurement).toEqual(expect.objectContaining({ leftPx: 10, rightPx: 80 }));

    const fakePointerDown = { stopPropagation: jest.fn(), preventDefault: jest.fn() } as any;
    act(() => result.current.onGripPointerDown('start')(fakePointerDown));

    fireEvent(document, new MouseEvent('pointermove', { clientX: 48, clientY: 50 }));
    expect(result.current.measurement?.leftPx).toBe(50);
    expect(result.current.measurement?.rightPx).toBe(80); // unchanged — only the dragged end moved

    fireEvent(document, new MouseEvent('pointerup'));
  });
});
