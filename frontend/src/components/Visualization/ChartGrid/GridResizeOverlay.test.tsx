import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import GridResizeOverlay from './GridResizeOverlay';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  (global as any).ResizeObserver = ResizeObserverMock;
});

describe('GridResizeOverlay facet handles', () => {
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
        facetLeftValueWidthsPx={[40, 60]}
        facetTopValueHeightsPx={[20, 20]}
        onFacetColumnResize={onFacetColumnResize}
      />,
    );

    const handle = getByTestId('facet-col-handle-0');
    fireEvent.mouseDown(handle, { clientX: 100, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 126, clientY: 0 });
    fireEvent.mouseUp(document, { clientX: 126, clientY: 0 });

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
        facetLeftValueWidthsPx={[40, 60]}
        facetTopValueHeightsPx={[20, 30]}
        onFacetRowResize={onFacetRowResize}
      />,
    );

    const handle = getByTestId('facet-row-handle-1');
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 150 });
    fireEvent.mouseMove(document, { clientX: 0, clientY: 168 });
    fireEvent.mouseUp(document, { clientX: 0, clientY: 168 });

    expect(onFacetRowResize).toHaveBeenCalledWith(1, { currentSize: 30, delta: 18 });
  });
});