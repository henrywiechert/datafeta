// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * The whole point of the hook is that it can be listed in a dependency array without
 * invalidating the callback on every state change. These tests run against the real
 * providers, so a regression in either half (the snapshot getter losing its ref-based
 * stability, or recordAction gaining a state dependency) fails here rather than as a
 * mysterious chart redraw.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useRecordUndoPoint } from './useRecordUndoPoint';
import { useVisualizationContext, VisualizationProvider } from '../contexts/VisualizationContext';
import { UndoRedoProvider, useUndoRedo } from '../contexts/UndoRedoContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <VisualizationProvider>
    <UndoRedoProvider sheetId="sheet-1">{children}</UndoRedoProvider>
  </VisualizationProvider>
);

const renderRecordUndoPoint = () =>
  renderHook(
    () => ({
      recordUndoPoint: useRecordUndoPoint(),
      dispatch: useVisualizationContext().dispatch,
      undoRedo: useUndoRedo(),
    }),
    { wrapper },
  );

test('keeps its identity across visualisation state changes', () => {
  const { result } = renderRecordUndoPoint();
  const initial = result.current.recordUndoPoint;

  act(() => {
    result.current.dispatch({ type: 'SET_INDEPENDENT_DOMAIN', payload: { axis: 'x', independent: true } });
  });

  expect(result.current.recordUndoPoint).toBe(initial);
});

test('records the state as it was before the change it precedes', () => {
  const { result } = renderRecordUndoPoint();
  expect(result.current.undoRedo.canUndo).toBe(false);

  act(() => {
    result.current.recordUndoPoint();
    result.current.dispatch({ type: 'SET_INDEPENDENT_DOMAIN', payload: { axis: 'x', independent: true } });
  });

  expect(result.current.undoRedo.canUndo).toBe(true);
  expect(result.current.undoRedo.undo()).toMatchObject({ independentDomains: { x: false } });
});
