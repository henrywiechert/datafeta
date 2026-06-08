// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { axisReducer } from './axisReducer';
import { initialState } from '../initialState';
import { MapViewBounds } from '../types';

const GB_BOUNDS: MapViewBounds = [-6, 50, 2, 58];

describe('axisReducer query state semantics', () => {
  test('SET_QUERY_ERROR with null clears error but preserves previous result', () => {
    const previousResult = {
      columns: [{ name: 'category' }, { name: 'value' }],
      rows: [{ category: 'A', value: 10 }],
      row_count: 1,
    } as any;

    const state = {
      ...initialState,
      queryResult: previousResult,
      queryError: 'Old error',
    };

    const nextState = axisReducer(state, {
      type: 'SET_QUERY_ERROR',
      payload: null,
    } as any);

    expect(nextState).not.toBeNull();
    expect(nextState!.queryError).toBeNull();
    expect(nextState!.queryResult).toBe(previousResult);
  });

  test('SET_QUERY_ERROR with message preserves previous result', () => {
    const previousResult = {
      columns: [{ name: 'category' }],
      rows: [{ category: 'A' }],
      row_count: 1,
    } as any;

    const state = {
      ...initialState,
      queryResult: previousResult,
      queryError: null,
    };

    const nextState = axisReducer(state, {
      type: 'SET_QUERY_ERROR',
      payload: 'Query failed',
    } as any);

    expect(nextState).not.toBeNull();
    expect(nextState!.queryError).toBe('Query failed');
    expect(nextState!.queryResult).toBe(previousResult);
  });

  test('SET_QUERY_RESULT replaces result and clears error', () => {
    const newResult = {
      columns: [{ name: 'x' }],
      rows: [{ x: 1 }],
      row_count: 1,
    } as any;

    const state = {
      ...initialState,
      queryResult: null,
      queryError: 'Previous failure',
    };

    const nextState = axisReducer(state, {
      type: 'SET_QUERY_RESULT',
      payload: newResult,
    } as any);

    expect(nextState).not.toBeNull();
    expect(nextState!.queryResult).toBe(newResult);
    expect(nextState!.queryError).toBeNull();
  });

  test('RESET_QUERY_STATE explicitly clears result and error', () => {
    const state = {
      ...initialState,
      queryResult: {
        columns: [{ name: 'x' }],
        rows: [{ x: 1 }],
        row_count: 1,
      } as any,
      queryError: 'Any error',
    };

    const nextState = axisReducer(state, {
      type: 'RESET_QUERY_STATE',
    } as any);

    expect(nextState).not.toBeNull();
    expect(nextState!.queryResult).toBeNull();
    expect(nextState!.queryError).toBeNull();
  });
});

describe('axisReducer map view state', () => {
  test('SET_MAP_VIEW_BOUNDS stores override per plotId without bumping queryVersion', () => {
    const state = { ...initialState, queryVersion: 4 };
    const next = axisReducer(state, {
      type: 'SET_MAP_VIEW_BOUNDS',
      payload: { plotId: 'map-0-0', bounds: GB_BOUNDS },
    } as any);

    expect(next!.mapViewByPlotId['map-0-0']).toEqual(GB_BOUNDS);
    expect(next!.queryVersion).toBe(4);
  });

  test('SET_MAP_VIEW_BOUNDS rejects invalid bounds', () => {
    const next = axisReducer(initialState, {
      type: 'SET_MAP_VIEW_BOUNDS',
      payload: { plotId: 'map-0-0', bounds: [0, 0, 0, 0] },
    } as any);
    expect(next).toBe(initialState);
  });

  test('SET_MAP_VIEW_BOUNDS returns same reference when bounds unchanged', () => {
    const state = {
      ...initialState,
      mapViewByPlotId: { 'map-0-0': GB_BOUNDS },
    };
    const next = axisReducer(state, {
      type: 'SET_MAP_VIEW_BOUNDS',
      payload: { plotId: 'map-0-0', bounds: GB_BOUNDS },
    } as any);
    expect(next).toBe(state);
  });

  test('RESET_MAP_VIEW removes one plot override', () => {
    const state = {
      ...initialState,
      mapViewByPlotId: {
        'map-0-0': GB_BOUNDS,
        'map-0-1': [0, 40, 10, 50] as MapViewBounds,
      },
    };
    const next = axisReducer(state, {
      type: 'RESET_MAP_VIEW',
      payload: { plotId: 'map-0-0' },
    } as any);
    expect(next!.mapViewByPlotId).toEqual({ 'map-0-1': [0, 40, 10, 50] });
  });

  test('RESET_ALL_MAP_VIEWS clears all overrides', () => {
    const state = {
      ...initialState,
      mapViewByPlotId: { 'map-0-0': GB_BOUNDS },
    };
    const next = axisReducer(state, { type: 'RESET_ALL_MAP_VIEWS' } as any);
    expect(next!.mapViewByPlotId).toEqual({});
  });

  test('RESET_ALL_MAP_VIEWS is a no-op when already empty', () => {
    const next = axisReducer(initialState, { type: 'RESET_ALL_MAP_VIEWS' } as any);
    expect(next).toBe(initialState);
  });

  test('non-reorder axis field change clears map view overrides', () => {
    const lonField = {
      id: 'lon-id',
      columnName: 'longitude',
      type: 'dimension',
      flavour: 'continuous',
      dataType: 'float',
    } as any;
    const state = {
      ...initialState,
      xAxisFields: [],
      mapViewByPlotId: { 'map-0-0': GB_BOUNDS },
    };
    const next = axisReducer(state, {
      type: 'SET_X_AXIS_FIELDS',
      payload: [lonField],
    } as any);
    expect(next!.mapViewByPlotId).toEqual({});
    expect(next!.queryVersion).toBe(state.queryVersion + 1);
  });
});
