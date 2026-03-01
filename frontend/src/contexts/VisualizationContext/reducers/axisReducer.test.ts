import { axisReducer } from './axisReducer';
import { initialState } from '../initialState';

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
