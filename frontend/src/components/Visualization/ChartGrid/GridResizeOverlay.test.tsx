// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import GridResizeOverlay from './GridResizeOverlay';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

// jsdom doesn't implement PointerEvent. Polyfill as a MouseEvent subclass so
// `clientX/clientY` and friends propagate from the init dict.
class PointerEventPolyfill extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? '';
  }
}

beforeAll(() => {
  (global as any).ResizeObserver = ResizeObserverMock;
  if (typeof (global as any).PointerEvent === 'undefined') {
    (global as any).PointerEvent = PointerEventPolyfill;
  }
});

describe('GridResizeOverlay facet handles', () => {
  it('commits a plot-column resize from the top facet header separator', () => {
    const onColumnResize = jest.fn();
    const plotGridRef = React.createRef<HTMLDivElement>();

    const { getByTestId } = render(
      <GridResizeOverlay
        columns={2}
        rows={2}
        columnTemplate="120px 120px"
        rowTemplate="80px 80px"
        leftFixedWidth={180}
        bottomFixedHeight={30}
        topHeaderHeight={60}
        containerWidth={500}
        containerHeight={300}
        horizontalScrollOffset={0}
        verticalScrollOffset={0}
        plotGridRef={plotGridRef}
        onColumnResize={onColumnResize}
      />,
    );

    const handle = getByTestId('top-facet-col-handle-1');
    expect(handle).toHaveStyle({ left: '300px', top: '0px', height: '60px' });
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 300, clientY: 10 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 334, clientY: 10 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 334, clientY: 10 });

    expect(onColumnResize).toHaveBeenCalledWith({ currentSize: 120, delta: 34 });
  });

  it('commits a plot-column resize from the top edge when no facet header is present', () => {
    const onColumnResize = jest.fn();
    const plotGridRef = React.createRef<HTMLDivElement>();

    const { getByTestId } = render(
      <GridResizeOverlay
        columns={2}
        rows={2}
        columnTemplate="120px 120px"
        rowTemplate="80px 80px"
        leftFixedWidth={180}
        bottomFixedHeight={30}
        topHeaderHeight={0}
        topColumnHandleLength={20}
        containerWidth={500}
        containerHeight={300}
        horizontalScrollOffset={0}
        verticalScrollOffset={0}
        plotGridRef={plotGridRef}
        onColumnResize={onColumnResize}
      />,
    );

    const handle = getByTestId('top-plot-col-handle-1');
    expect(handle).toHaveStyle({ left: '300px', top: '0px', height: '20px' });
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 300, clientY: 10 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 332, clientY: 10 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 332, clientY: 10 });

    expect(onColumnResize).toHaveBeenCalledWith({ currentSize: 120, delta: 32 });
  });

  it('does not render plot resize handles when plot resizing is disabled', () => {
    const plotGridRef = React.createRef<HTMLDivElement>();

    const { queryByTestId } = render(
      <GridResizeOverlay
        columns={2}
        rows={2}
        columnTemplate="120px 120px"
        rowTemplate="80px 80px"
        leftFixedWidth={180}
        bottomFixedHeight={30}
        topHeaderHeight={60}
        containerWidth={500}
        containerHeight={300}
        horizontalScrollOffset={0}
        verticalScrollOffset={0}
        plotGridRef={plotGridRef}
      />,
    );

    expect(queryByTestId('top-facet-col-handle-1')).toBeNull();
    expect(queryByTestId('top-plot-col-handle-1')).toBeNull();
    expect(queryByTestId('plot-col-handle-1')).toBeNull();
    expect(queryByTestId('plot-row-handle-1')).toBeNull();
  });

  it('commits a depth-specific left facet width resize', () => {
    const onFacetColumnResize = jest.fn();
    const plotGridRef = React.createRef<HTMLDivElement>();

    const { getByTestId } = render(
      <GridResizeOverlay
        columns={2}
        rows={2}
        columnTemplate="120px 120px"
        rowTemplate="80px 80px"
        leftFixedWidth={180}
        bottomFixedHeight={30}
        topHeaderHeight={60}
        containerWidth={500}
        containerHeight={300}
        horizontalScrollOffset={0}
        verticalScrollOffset={0}
        plotGridRef={plotGridRef}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[40, 60]}
        facetTopValueHeightsPx={[20, 20]}
        onFacetColumnResize={onFacetColumnResize}
      />,
    );

    const handle = getByTestId('facet-col-handle-0');
    expect(handle).toHaveStyle({ left: '68px', top: '60px', height: '210px' });
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 100, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 126, clientY: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 126, clientY: 0 });

    expect(onFacetColumnResize).toHaveBeenCalledWith(0, { currentSize: 40, delta: 26 });
  });

  it('commits a depth-specific top facet height resize', () => {
    const onFacetRowResize = jest.fn();
    const plotGridRef = React.createRef<HTMLDivElement>();

    const { getByTestId } = render(
      <GridResizeOverlay
        columns={2}
        rows={2}
        columnTemplate="120px 120px"
        rowTemplate="80px 80px"
        leftFixedWidth={180}
        bottomFixedHeight={30}
        topHeaderHeight={70}
        containerWidth={500}
        containerHeight={300}
        horizontalScrollOffset={0}
        verticalScrollOffset={0}
        plotGridRef={plotGridRef}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[40, 60]}
        facetTopValueHeightsPx={[20, 30]}
        onFacetRowResize={onFacetRowResize}
      />,
    );

    const handle = getByTestId('facet-row-handle-1');
    expect(handle).toHaveStyle({ top: '70px', left: '180px', width: '320px' });
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 0, clientY: 150 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0, clientY: 168 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 0, clientY: 168 });

    expect(onFacetRowResize).toHaveBeenCalledWith(1, { currentSize: 30, delta: 18 });
  });
});