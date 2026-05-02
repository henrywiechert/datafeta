import React from 'react';
import { cleanup, render } from '@testing-library/react';
import PlotArea from './PlotArea';
import { GridCellModel, GridResultModel } from '../../../observable-plot-generator/gridModel';

jest.mock('../ObservablePlot', () => ({
  __esModule: true,
  default: ({ plotId }: { plotId?: string }) => (
    <div data-testid={`observable-plot-${plotId ?? 'unknown'}`} />
  ),
}));

jest.mock('./renderers/PieSvgRenderer', () => ({
  __esModule: true,
  default: ({ plotId }: { plotId?: string }) => (
    <div data-testid={`pie-svg-${plotId ?? 'unknown'}`} />
  ),
}));

jest.mock('./BrushOverlay', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

function renderArea(grid: GridResultModel) {
  const ref = React.createRef<HTMLDivElement>();
  return render(
    <PlotArea
      grid={grid}
      plotsTranslateRef={ref}
      plotTemplateColumns="100px"
      plotRowsSpec="100px"
      totalContentWidthPx={100}
    />,
  );
}

describe('PlotArea cell dispatch', () => {
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
          kind: 'text',
          rows: [{ source: 'measure', label: 'Sales', value: '$1,234' }],
        },
      },
    ]);

    const { container, getByText } = renderArea(grid);
    expect(getByText('$1,234')).toBeInTheDocument();
    expect(container.querySelectorAll('span').length).toBe(1);
  });

  it('renders stacked text rows with "alias: value" prefixes when there are multiple rows', () => {
    const grid = buildGrid([
      {
        id: 'text-multi',
        position: { row: 0, col: 0 },
        content: {
          kind: 'text',
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

  it('renders a single SVG symbol for mark cells with one symbol', () => {
    const grid = buildGrid([
      {
        id: 'mark-1',
        position: { row: 0, col: 0 },
        content: {
          kind: 'mark',
          symbols: [{ symbol: 'circle', color: 'steelblue', size: 36 }],
        },
      },
    ]);

    const { container } = renderArea(grid);
    expect(container.querySelectorAll('svg').length).toBe(1);
    expect(container.querySelectorAll('circle').length).toBe(1);
  });

  it('renders a preview stack with one element per symbol for mixed mark cells', () => {
    const grid = buildGrid([
      {
        id: 'mark-mix',
        position: { row: 0, col: 0 },
        content: {
          kind: 'mark',
          symbols: [
            { symbol: 'circle', color: 'steelblue', size: 36 },
            { symbol: 'square', color: 'orange', size: 36 },
            { symbol: 'triangle', color: 'green', size: 36 },
          ],
        },
      },
    ]);

    const { container } = renderArea(grid);
    expect(container.querySelectorAll('circle').length).toBe(1);
    expect(container.querySelectorAll('rect').length).toBe(1);
    expect(container.querySelectorAll('polygon').length).toBe(1);
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
