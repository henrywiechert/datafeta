// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { createLoadingStore, dispatchLoading } from './loadingStore';

describe('loadingStore', () => {
  it('applies a batch of actions in order with a single notification', () => {
    const store = createLoadingStore();
    const listener = jest.fn();
    store.subscribe(listener);

    dispatchLoading(
      store,
      { type: 'SET_OPERATION_START_TIME', payload: { op: 'query', time: 100 } },
      { type: 'ADD_ACTIVE_OPERATION', payload: 'query' },
      { type: 'SET_LOADING_QUERY', payload: true },
      { type: 'ENSURE_PRIMARY_OPERATION', payload: 'query' },
      { type: 'REQUEST_SHOW_MODAL', payload: { operationType: 'query', canCancel: true } },
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({
      isLoadingQuery: true,
      activeOperations: ['query'],
      modalPrimaryOperation: 'query',
      showLoadingModal: true,
      loadingOperationType: 'query',
    });
  });

  it('closes the modal once the last operation completes', () => {
    const store = createLoadingStore();
    dispatchLoading(
      store,
      { type: 'ADD_ACTIVE_OPERATION', payload: 'rendering' },
      { type: 'SET_LOADING_RENDERING', payload: true },
      { type: 'REQUEST_SHOW_MODAL', payload: { operationType: 'rendering', canCancel: true } },
    );

    dispatchLoading(
      store,
      { type: 'REMOVE_ACTIVE_OPERATION', payload: 'rendering' },
      { type: 'COMPLETE_SPECIFIC_OPERATION', payload: 'rendering' },
    );

    expect(store.getState()).toMatchObject({
      isLoadingRendering: false,
      activeOperations: [],
      showLoadingModal: false,
      modalPrimaryOperation: null,
    });
  });

  it('does not notify when the actions leave the state unchanged', () => {
    const store = createLoadingStore();
    const listener = jest.fn();
    store.subscribe(listener);

    // The modal request is ignored for an operation that is not active.
    dispatchLoading(store, { type: 'REQUEST_SHOW_MODAL', payload: { operationType: 'query', canCancel: true } });

    expect(listener).not.toHaveBeenCalled();
  });
});
