// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Per-sheet loading state (query/rendering operations and the loading modal).
 *
 * Kept out of VisualizationState on purpose: every state change there
 * re-renders all VisualizationContext consumers (fields panel, filters,
 * overrides, legend, ...). A refresh goes through about six loading
 * transitions, so with this state in the context each one re-rendered the
 * whole app for 200-700 ms. Here only components that select the changed
 * value re-render.
 */
import { createContext, useContext } from 'react';
import { createStore, useStore, StoreApi } from 'zustand';
import { LoadingOperationType } from './types';
import { loadingReducer, LoadingAction } from './reducers/loadingReducer';

export interface LoadingState {
  isLoadingQuery: boolean;
  isLoadingRendering: boolean;
  showLoadingModal: boolean;
  loadingOperationType: LoadingOperationType | null;
  loadingStartTime: number | null;
  canCancelOperation: boolean;
  operationStartTimes: Record<LoadingOperationType, number | null>;
  activeOperations: LoadingOperationType[];
  modalPrimaryOperation: LoadingOperationType | null;
}

export const initialLoadingState: LoadingState = {
  isLoadingQuery: false,
  isLoadingRendering: false,
  showLoadingModal: false,
  loadingOperationType: null,
  loadingStartTime: null,
  canCancelOperation: false,
  operationStartTimes: { query: null, rendering: null, metadata: null },
  activeOperations: [],
  modalPrimaryOperation: null,
};

export type LoadingStore = StoreApi<LoadingState>;

export function createLoadingStore(): LoadingStore {
  return createStore<LoadingState>(() => initialLoadingState);
}

/** Applies the actions in order and notifies subscribers once. */
export function dispatchLoading(store: LoadingStore, ...actions: LoadingAction[]): void {
  store.setState((state) => actions.reduce(loadingReducer, state), true);
}

export const LoadingStoreContext = createContext<LoadingStore | null>(null);

/** The sheet's loading store, for imperative reads that must not subscribe. */
export function useLoadingStore(): LoadingStore {
  const store = useContext(LoadingStoreContext);
  if (!store) {
    throw new Error('useLoadingStore must be used within a VisualizationProvider');
  }
  return store;
}

/** Subscribes to a slice of the sheet's loading state. */
export function useLoadingState<T>(selector: (state: LoadingState) => T): T {
  return useStore(useLoadingStore(), selector);
}
