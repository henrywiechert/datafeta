import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { GridLayoutModel, GridResultModel } from '../gridModel';
import { CellSizeOverrides, useCellSizeOverrides } from './useCellSizeOverrides';

function buildGrid(overrides: Partial<GridLayoutModel> = {}): GridResultModel {
  return {
    cells: [
      {
        id: 'plot',
        position: { row: 0, col: 0 },
        content: { kind: 'plot', options: {} },
        metadata: { title: 'Plot' },
      },
    ],
    layout: {
      type: 'grid',
      columns: 2,
      rows: 2,
      columnSizes: ['fr', 'fr'],
      rowSizes: ['fr', 'fr'],
      ...overrides,
    },
  };
}

describe('useCellSizeOverrides', () => {
  let latest: CellSizeOverrides;

  const Harness: React.FC<{ grid: GridResultModel }> = ({ grid }) => {
    latest = useCellSizeOverrides(grid);
    return null;
  };

  afterEach(() => {
    cleanup();
  });

  it('applies one clamped column and row size from resize intents', () => {
    render(<Harness grid={buildGrid({ minColumnSizes: [80], minRowSizes: [70] })} />);

    act(() => latest.handleColumnResize({ currentSize: 120, delta: 44.4 }));
    act(() => latest.handleRowResize({ currentSize: 100, delta: -50 }));

    expect(latest.userCellWidth).toBe(164);
    expect(latest.userCellHeight).toBe(70);
    expect(latest.hasOverrides).toBe(true);
  });

  it('uses the same clamped size for drag previews and committed resizes', () => {
    render(<Harness grid={buildGrid({ minColumnSizes: [90], minRowSizes: [60] })} />);

    const columnIntent = { currentSize: 100, delta: -25 };
    const rowIntent = { currentSize: 100, delta: 23.6 };

    expect(latest.previewColumnResize(columnIntent)).toBe(90);
    expect(latest.previewRowResize(rowIntent)).toBe(124);

    act(() => latest.handleColumnResize(columnIntent));
    act(() => latest.handleRowResize(rowIntent));

    expect(latest.userCellWidth).toBe(90);
    expect(latest.userCellHeight).toBe(124);
  });

  it('resets explicit sizes manually and when the generated layout sizing contract changes', () => {
    const { rerender } = render(<Harness grid={buildGrid()} />);

    act(() => latest.handleColumnResize({ currentSize: 120, delta: 20 }));
    act(() => latest.handleRowResize({ currentSize: 120, delta: 30 }));
    expect(latest.hasOverrides).toBe(true);

    act(() => latest.handleReset());
    expect(latest.userCellWidth).toBeNull();
    expect(latest.userCellHeight).toBeNull();

    act(() => latest.handleColumnResize({ currentSize: 120, delta: 20 }));
    rerender(<Harness grid={buildGrid({ minColumnSizes: [100] })} />);

    expect(latest.userCellWidth).toBeNull();
    expect(latest.userCellHeight).toBeNull();
  });
});
