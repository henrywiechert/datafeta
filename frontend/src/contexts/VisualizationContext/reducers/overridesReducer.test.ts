import { overridesReducer } from './overridesReducer';
import { initialState } from '../initialState';

describe('overridesReducer SET_TABLE_PAGE (PR 8)', () => {
  test('updates tablePage to a non-negative integer', () => {
    const next = overridesReducer(initialState, { type: 'SET_TABLE_PAGE', payload: 3 } as any);
    expect(next).not.toBeNull();
    expect(next!.tablePage).toBe(3);
  });

  test('clamps negative values to 0', () => {
    const next = overridesReducer(initialState, { type: 'SET_TABLE_PAGE', payload: -5 } as any);
    expect(next!.tablePage).toBe(0);
  });

  test('floors fractional values', () => {
    const next = overridesReducer(initialState, { type: 'SET_TABLE_PAGE', payload: 2.7 } as any);
    expect(next!.tablePage).toBe(2);
  });

  test('returns the same reference when the page is unchanged (no re-render churn)', () => {
    const state = { ...initialState, tablePage: 4 };
    const next = overridesReducer(state, { type: 'SET_TABLE_PAGE', payload: 4 } as any);
    expect(next).toBe(state);
  });

  test('does not bump queryVersion (pager is a render-only concern)', () => {
    const state = { ...initialState, queryVersion: 7 };
    const next = overridesReducer(state, { type: 'SET_TABLE_PAGE', payload: 1 } as any);
    expect(next!.queryVersion).toBe(7);
  });
});
