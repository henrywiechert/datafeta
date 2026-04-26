import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { PlotResult } from '../../../../observable-plot-generator/types';
import { CellSizeOverrides, useCellSizeOverrides } from './useCellSizeOverrides';

function buildSpec(overrides: Partial<PlotResult['layout']> = {}): PlotResult {
  return {
    library: 'observable-plot',
    plots: [{ id: 'plot', title: 'Plot', options: {}, position: { row: 0, col: 0 } }],
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

  const Harness: React.FC<{ spec: PlotResult }> = ({ spec }) => {
    latest = useCellSizeOverrides(spec);
    return null;
  };

  afterEach(() => {
    cleanup();
  });

  it('applies one clamped column and row size from resize intents', () => {
    render(<Harness spec={buildSpec({ minColumnSizes: [80], minRowSizes: [70] })} />);

    act(() => latest.handleColumnResize({ currentSize: 120, delta: 44.4 }));
    act(() => latest.handleRowResize({ currentSize: 100, delta: -50 }));

    expect(latest.userCellWidth).toBe(164);
    expect(latest.userCellHeight).toBe(70);
    expect(latest.hasOverrides).toBe(true);
  });

  it('uses the same clamped size for drag previews and committed resizes', () => {
    render(<Harness spec={buildSpec({ minColumnSizes: [90], minRowSizes: [60] })} />);

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
    const { rerender } = render(<Harness spec={buildSpec()} />);

    act(() => latest.handleColumnResize({ currentSize: 120, delta: 20 }));
    act(() => latest.handleRowResize({ currentSize: 120, delta: 30 }));
    expect(latest.hasOverrides).toBe(true);

    act(() => latest.handleReset());
    expect(latest.userCellWidth).toBeNull();
    expect(latest.userCellHeight).toBeNull();

    act(() => latest.handleColumnResize({ currentSize: 120, delta: 20 }));
    rerender(<Harness spec={buildSpec({ minColumnSizes: [100] })} />);

    expect(latest.userCellWidth).toBeNull();
    expect(latest.userCellHeight).toBeNull();
  });
});
