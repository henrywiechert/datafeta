// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { overridesReducer } from './overridesReducer';
import { initialState } from '../initialState';

function withTablePage(page: number) {
  return {
    ...initialState,
    chartTypeParams: {
      ...initialState.chartTypeParams,
      table: { ...initialState.chartTypeParams.table, page },
    },
  };
}

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
