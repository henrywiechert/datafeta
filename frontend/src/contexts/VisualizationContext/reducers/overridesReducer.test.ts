// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { overridesReducer } from './overridesReducer';
import { initialState } from '../initialState';
import { MapViewBounds } from '../types';

function withTablePage(page: number) {
  return {
    ...initialState,
    chartTypeParams: {
      ...initialState.chartTypeParams,
      table: { ...initialState.chartTypeParams.table, page },
    },
  };
}

describe('overridesReducer SET_GLOBAL_CHART_TYPE (registry-driven queryVersion)', () => {
  const at = (state: typeof initialState, payload: any) =>
    overridesReducer(state, { type: 'SET_GLOBAL_CHART_TYPE', payload } as any);

  test('does not bump queryVersion between two non-bumping types (bar -> line)', () => {
    const state = { ...initialState, globalChartType: 'bar' as const, queryVersion: 5 };
    const next = at(state, 'line');
    expect(next!.globalChartType).toBe('line');
    expect(next!.queryVersion).toBe(5);
  });

  test('bumps queryVersion when entering a bumping type (null -> cdf)', () => {
    const state = { ...initialState, globalChartType: null, queryVersion: 5 };
    const next = at(state, 'cdf');
    expect(next!.queryVersion).toBe(6);
  });

  test('bumps queryVersion when leaving a bumping type (density -> null)', () => {
    const state = { ...initialState, globalChartType: 'density' as const, queryVersion: 5 };
    const next = at(state, null);
    expect(next!.queryVersion).toBe(6);
  });

  test('bumps queryVersion exactly once between two bumping types (cdf -> pie)', () => {
    const state = { ...initialState, globalChartType: 'cdf' as const, queryVersion: 5 };
    const next = at(state, 'pie');
    expect(next!.queryVersion).toBe(6);
  });

  test('does not bump queryVersion when the value is unchanged', () => {
    const state = { ...initialState, globalChartType: 'cdf' as const, queryVersion: 5 };
    const next = at(state, 'cdf');
    expect(next!.queryVersion).toBe(5);
  });
});

describe('overridesReducer SET_TABLE_PAGE (PR 8)', () => {
  test('updates tablePage to a non-negative integer', () => {
    const next = overridesReducer(initialState, { type: 'SET_TABLE_PAGE', payload: 3 } as any);
    expect(next).not.toBeNull();
    expect(next!.chartTypeParams.table.page).toBe(3);
  });

  test('clamps negative values to 0', () => {
    const next = overridesReducer(withTablePage(2), { type: 'SET_TABLE_PAGE', payload: -5 } as any);
    expect(next!.chartTypeParams.table.page).toBe(0);
  });

  test('floors fractional values', () => {
    const next = overridesReducer(initialState, { type: 'SET_TABLE_PAGE', payload: 2.7 } as any);
    expect(next!.chartTypeParams.table.page).toBe(2);
  });

  test('returns the same reference when the page is unchanged (no re-render churn)', () => {
    const state = withTablePage(4);
    const next = overridesReducer(state, { type: 'SET_TABLE_PAGE', payload: 4 } as any);
    expect(next).toBe(state);
  });

  test('does not bump queryVersion (pager is a render-only concern)', () => {
    const state = { ...initialState, queryVersion: 7 };
    const next = overridesReducer(state, { type: 'SET_TABLE_PAGE', payload: 1 } as any);
    expect(next!.queryVersion).toBe(7);
  });
});

describe('overridesReducer SET_MAP_EXTENT_MODE', () => {
  test('updates map extent mode without bumping queryVersion', () => {
    const state = { ...initialState, queryVersion: 3 };
    const next = overridesReducer(state, { type: 'SET_MAP_EXTENT_MODE', payload: 'world' } as any);
    expect(next!.chartTypeParams.map.extentMode).toBe('world');
    expect(next!.queryVersion).toBe(3);
  });

  test('returns the same reference when extent mode is unchanged', () => {
    const next = overridesReducer(initialState, { type: 'SET_MAP_EXTENT_MODE', payload: 'data' } as any);
    expect(next).toBe(initialState);
  });

  test('clears map view overrides when extent mode changes', () => {
    const state = {
      ...initialState,
      mapViewByPlotId: { 'map-0-0': [-6, 50, 2, 58] as MapViewBounds },
    };
    const next = overridesReducer(state, { type: 'SET_MAP_EXTENT_MODE', payload: 'world' } as any);
    expect(next!.chartTypeParams.map.extentMode).toBe('world');
    expect(next!.mapViewByPlotId).toEqual({});
  });
});
