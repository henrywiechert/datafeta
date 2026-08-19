// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { renderHook, act } from '@testing-library/react';
import { useChartActions } from './useChartActions';

const mockRecordUndoPoint = jest.fn();

// Stable identity across renders, as the real hook guarantees.
jest.mock('../../../../hooks/useRecordUndoPoint', () => ({
  useRecordUndoPoint: () => mockRecordUndoPoint,
}));

jest.mock('../../../../services/columnCacheManager', () => ({
  columnCacheManager: { invalidateForTable: jest.fn() },
}));

jest.mock('../../../../services/filterTierManager', () => ({
  filterTierManager: { resetBaseFilterState: jest.fn() },
}));

describe('useChartActions toolbar handlers', () => {
  const dispatch = jest.fn();

  const setup = () => {
    const { result } = renderHook(() =>
      useChartActions({
        dispatch,
        getUndoableSnapshot: jest.fn(),
        undo: jest.fn(),
        completeUndo: jest.fn(),
        redo: jest.fn(),
        completeRedo: jest.fn(),
        resetWorkspace: jest.fn(),
        clearSessionFilters: jest.fn(),
        bandThicknessScale: 1,
        selectedTable: 'orders',
        selectedDatabase: 'analytics',
      }),
    );
    return result;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies optimization settings with an immediate refresh and no undo point', () => {
    const settings = { enabled: true } as any;
    const result = setup();

    act(() => result.current.handleUpdateOptimizationSettings(settings));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_QUERY_OPTIMIZATION_SETTINGS',
      payload: settings,
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'FORCE_QUERY_REFRESH' });
    expect(mockRecordUndoPoint).not.toHaveBeenCalled();
  });

  it('records an undo point before changing band thickness scale', () => {
    const result = setup();

    act(() => result.current.handleBandThicknessScaleChange(1.5));

    expect(mockRecordUndoPoint).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_BAND_THICKNESS_SCALE', payload: 1.5 });
  });

  it('records an undo point before toggling the chart caption', () => {
    const result = setup();

    act(() => result.current.handleToggleChartCaption(false));

    expect(mockRecordUndoPoint).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SHOW_CHART_CAPTION', payload: false });
  });
});
