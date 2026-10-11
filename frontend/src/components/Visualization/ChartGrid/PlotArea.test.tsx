// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import PlotArea from './PlotArea';
import { GridCellModel, GridResultModel } from '../../../observable-plot-generator/gridModel';
import { computeGanttMeasurement } from './utils/ganttMeasure';

const mockReceivedOptions: any[] = [];

jest.mock('../ObservablePlot', () => ({
  __esModule: true,
  default: ({ plotId, options, onPlotReady }: { plotId?: string; options?: any; onPlotReady?: (el: any) => void }) => {
    mockReceivedOptions.push(options);
    // Give PlotArea a (fake) plot element so handleCellBrushEnd doesn't bail early.
    onPlotReady?.({});
    return <div data-testid={`observable-plot-${plotId ?? 'unknown'}`} />;
  },
}));

jest.mock('./renderers/PieSvgRenderer', () => ({
  __esModule: true,
  default: ({ plotId }: { plotId?: string }) => (
    <div data-testid={`pie-svg-${plotId ?? 'unknown'}`} />
  ),
}));

/** Captures the props BrushOverlay receives so tests can trigger onBrushEnd/onDragStart directly. */
const brushOverlayProps: any[] = [];

jest.mock('./BrushOverlay', () => ({
  __esModule: true,
  default: (props: { children: React.ReactNode }) => {
    brushOverlayProps.push(props);
    return <>{props.children}</>;
  },
}));

jest.mock('./utils/ganttMeasure', () => ({
  __esModule: true,
  computeGanttMeasurement: jest.fn(),
}));

function buildGrid(cells: GridCellModel[]): GridResultModel {
  return {
    cells,
    layout: {
      type: 'grid',
      columns: Math.max(1, ...cells.map((c) => c.position.col + 1)),
      rows: Math.max(1, ...cells.map((c) => c.position.row + 1)),
      columnSizes: ['fr'],
      rowSizes: ['fr'],
    },
  };
}

function area(grid: GridResultModel, brushDisabled?: boolean, isGanttChart?: boolean) {
  return (
    <PlotArea
      grid={grid}
      plotsTranslateRef={React.createRef<HTMLDivElement>()}
      plotTemplateColumns="100px"
      plotRowsSpec="100px"
      totalContentWidthPx={100}
      brushDisabled={brushDisabled}
      isGanttChart={isGanttChart}
    />
  );
}

function renderArea(grid: GridResultModel) {
  return render(area(grid));
}

describe('PlotArea cell dispatch', () => {
  beforeEach(() => {
    mockReceivedOptions.length = 0;
  });
  afterEach(() => cleanup());

  it('renders ObservablePlot for plot cells', () => {
    const grid = buildGrid([
      {
        id: 'plot-1',
        position: { row: 0, col: 0 },
        content: { kind: 'plot', options: {} },
      },
    ]);

    const { getByTestId } = renderArea(grid);
    expect(getByTestId('observable-plot-plot-1')).toBeInTheDocument();
  });

  it('renders PieSvgRenderer for pie cells', () => {
    const grid = buildGrid([
      {
        id: 'pie-1',
        position: { row: 0, col: 0 },
        content: {
          kind: 'pie',
          pieSpec: { slices: [], total: 0, measureLabel: '', colorLabel: '', radiusScale: 1 } as any,
        },
      },
    ]);

    const { getByTestId } = renderArea(grid);
    expect(getByTestId('pie-svg-pie-1')).toBeInTheDocument();
  });

  it('renders a single text row with the value only (no alias prefix)', () => {
    const grid = buildGrid([
      {
        id: 'text-single',
        position: { row: 0, col: 0 },
        content: {
          kind: 'table-cell',
          symbols: [],
          rows: [{ source: 'measure', label: 'Sales', value: '$1,234' }],
        },
      },
    ]);

    const { container, getByText } = renderArea(grid);
    expect(getByText('$1,234')).toBeInTheDocument();
    expect(container.querySelectorAll('span').length).toBe(1);
    // Text-only cell renders no symbol svg.
    expect(container.querySelectorAll('svg').length).toBe(0);
  });

  it('renders stacked text rows with "alias: value" prefixes when there are multiple rows', () => {
    const grid = buildGrid([
      {
        id: 'text-multi',
        position: { row: 0, col: 0 },
        content: {
          kind: 'table-cell',
          symbols: [],
          rows: [
            { source: 'label', label: 'Region', value: 'East' },
            { source: 'measure', label: 'Sales', value: '$1,234' },
          ],
        },
      },
    ]);

    const { container, getByText } = renderArea(grid);
    expect(getByText('Region: East')).toBeInTheDocument();
    expect(getByText('Sales: $1,234')).toBeInTheDocument();
    expect(container.querySelectorAll('span').length).toBe(2);
  });

  it('renders a single SVG symbol for cells with one symbol and no text', () => {
    const grid = buildGrid([
      {
        id: 'mark-1',
        position: { row: 0, col: 0 },
        content: {
          kind: 'table-cell',
          symbols: [{ symbol: 'circle', color: 'steelblue', size: 36 }],
          rows: [],
        },
      },
    ]);

    const { container } = renderArea(grid);
    expect(container.querySelectorAll('svg').length).toBe(1);
    expect(container.querySelectorAll('circle').length).toBe(1);
    expect(container.querySelectorAll('span').length).toBe(0);
  });

  it('renders a preview stack with one element per symbol for mixed cells', () => {
    const grid = buildGrid([
      {
        id: 'mark-mix',
        position: { row: 0, col: 0 },
        content: {
          kind: 'table-cell',
          symbols: [
            { symbol: 'circle', color: 'steelblue', size: 36 },
            { symbol: 'square', color: 'orange', size: 36 },
            { symbol: 'triangle', color: 'green', size: 36 },
          ],
          rows: [],
        },
      },
    ]);

    const { container } = renderArea(grid);
    expect(container.querySelectorAll('circle').length).toBe(1);
    expect(container.querySelectorAll('rect').length).toBe(1);
    expect(container.querySelectorAll('polygon').length).toBe(1);
  });

  it('renders both a symbol and text rows when a cell carries both', () => {
    const grid = buildGrid([
      {
        id: 'mixed',
        position: { row: 0, col: 0 },
        content: {
          kind: 'table-cell',
          symbols: [{ symbol: 'circle', color: 'steelblue', size: 36 }],
          rows: [{ source: 'measure', label: 'Sales', value: '$1,234' }],
        },
      },
    ]);

    const { container, getByText } = renderArea(grid);
    expect(container.querySelectorAll('svg').length).toBe(1);
    expect(container.querySelectorAll('circle').length).toBe(1);
    expect(getByText('$1,234')).toBeInTheDocument();
  });

  it('hands ObservablePlot the same options object when it re-renders for an unrelated reason', () => {
    const grid = buildGrid([
      {
        id: 'plot-1',
        position: { row: 0, col: 0 },
        content: { kind: 'plot', options: { marks: [] } },
      },
    ]);

    const { rerender } = render(area(grid));
    const firstOptions = mockReceivedOptions[mockReceivedOptions.length - 1];

    rerender(area(grid, true));

    // ObservablePlot only skips a redraw when the reference is identical, so a fresh
    // object here would re-run Plot.plot() and replace the SVG of every cell.
    expect(mockReceivedOptions).toHaveLength(2);
    expect(mockReceivedOptions[1]).toBe(firstOptions);
  });

  it('renders a placeholder div for empty cells', () => {
    const grid = buildGrid([
      {
        id: 'empty-1',
        position: { row: 0, col: 0 },
        content: { kind: 'empty' },
      },
    ]);

    const { container } = renderArea(grid);
    // Empty cell wraps in a single div with the emptyCell class hash
    const emptyCells = container.querySelectorAll('div[class*="emptyCell"]');
    expect(emptyCells.length).toBe(1);
  });
});

describe('PlotArea Gantt measurement', () => {
  const plotCellGrid = buildGrid([
    {
      id: 'plot-1',
      position: { row: 0, col: 0 },
      content: { kind: 'plot', options: {} },
    },
  ]);

  beforeEach(() => {
    brushOverlayProps.length = 0;
    (computeGanttMeasurement as jest.Mock).mockReset();
  });
  afterEach(() => cleanup());

  it('passes measureEnabled to BrushOverlay only when isGanttChart', () => {
    render(area(plotCellGrid, false, true));
    expect(brushOverlayProps[0].measureEnabled).toBe(true);

    brushOverlayProps.length = 0;
    cleanup();

    render(area(plotCellGrid, false, false));
    expect(brushOverlayProps[0].measureEnabled).toBe(false);
  });

  it('renders the snapped measurement band + label after a measure-gesture brush end', () => {
    (computeGanttMeasurement as jest.Mock).mockReturnValue({
      axis: 'x',
      snappedStartPx: 10,
      snappedEndPx: 90,
      label: '3 days',
    });

    const { getByText } = render(area(plotCellGrid, false, true));
    const { onBrushEnd } = brushOverlayProps[0];
    act(() => onBrushEnd({ axis: 'x', startPx: 12, endPx: 88, gesture: 'measure' }));

    expect(getByText('3 days')).toBeInTheDocument();
  });

  it('clears the measurement overlay when a new drag starts', () => {
    (computeGanttMeasurement as jest.Mock).mockReturnValue({
      axis: 'x',
      snappedStartPx: 10,
      snappedEndPx: 90,
      label: '3 days',
    });

    const { getByText, queryByText } = render(area(plotCellGrid, false, true));
    const { onBrushEnd, onDragStart } = brushOverlayProps[0];
    act(() => onBrushEnd({ axis: 'x', startPx: 12, endPx: 88, gesture: 'measure' }));
    expect(getByText('3 days')).toBeInTheDocument();

    act(() => onDragStart());
    expect(queryByText('3 days')).not.toBeInTheDocument();
  });
});
