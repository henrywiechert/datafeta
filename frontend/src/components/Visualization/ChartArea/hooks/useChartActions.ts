/**
 * useChartActions – toolbar and keyboard-driven actions that mutate
 * visualisation state (undo / redo, axis swap, domain toggles, refresh, reset).
 */

import { useCallback } from 'react';
import { columnCacheManager } from '../../../../services/columnCacheManager';
import { filterTierManager } from '../../../../services/filterTierManager';

interface UseChartActionsProps {
  dispatch: (action: any) => void;
  recordAction: (snapshot: any) => void;
  getUndoableSnapshot: () => any;
  undo: () => any;
  completeUndo: (state: any) => void;
  redo: () => any;
  completeRedo: (state: any) => void;
  resetWorkspace: () => void;
  clearSessionFilters: () => void;
  bandThicknessScale: number;
  selectedTable: string | null;
  selectedDatabase: string | null;
}

export function useChartActions({
  dispatch,
  recordAction,
  getUndoableSnapshot,
  undo,
  completeUndo,
  redo,
  completeRedo,
  resetWorkspace,
  clearSessionFilters,
  bandThicknessScale,
  selectedTable,
  selectedDatabase,
}: UseChartActionsProps) {
  const handleResetWorkspace = useCallback(() => {
    dispatch({ type: 'CLEAR_MEASURE_GROUP' });
    clearSessionFilters();
    resetWorkspace();
  }, [dispatch, clearSessionFilters, resetWorkspace]);

  const handleSwapAxis = useCallback(() => {
    recordAction(getUndoableSnapshot());
    dispatch({ type: 'SWAP_AXIS_FIELDS' });
  }, [recordAction, getUndoableSnapshot, dispatch]);

  const handleUndo = useCallback(() => {
    const previousState = undo();
    if (previousState) {
      const currentState = getUndoableSnapshot();
      dispatch({
        type: 'RESTORE_UNDOABLE_STATE',
        payload: {
          ...previousState,
          fieldOverrides: previousState.fieldOverrides || {},
          bandThicknessScale: previousState.bandThicknessScale ?? bandThicknessScale,
        },
      });
      completeUndo(currentState);
    }
  }, [undo, completeUndo, dispatch, getUndoableSnapshot, bandThicknessScale]);

  const handleRedo = useCallback(() => {
    const nextState = redo();
    if (nextState) {
      const currentState = getUndoableSnapshot();
      dispatch({
        type: 'RESTORE_UNDOABLE_STATE',
        payload: {
          ...nextState,
          fieldOverrides: nextState.fieldOverrides || {},
          bandThicknessScale: nextState.bandThicknessScale ?? bandThicknessScale,
        },
      });
      completeRedo(currentState);
    }
  }, [redo, completeRedo, dispatch, getUndoableSnapshot, bandThicknessScale]);

  const handleIndependentXAxisToggle = useCallback(
    (independent: boolean) => {
      recordAction(getUndoableSnapshot());
      dispatch({ type: 'SET_INDEPENDENT_DOMAIN', payload: { axis: 'x', independent } });
    },
    [dispatch, getUndoableSnapshot, recordAction],
  );

  const handleIndependentYAxisToggle = useCallback(
    (independent: boolean) => {
      recordAction(getUndoableSnapshot());
      dispatch({ type: 'SET_INDEPENDENT_DOMAIN', payload: { axis: 'y', independent } });
    },
    [dispatch, getUndoableSnapshot, recordAction],
  );

  const handleForceRefresh = useCallback(async () => {
    if (!selectedTable) return;
    await columnCacheManager.invalidateForTable(selectedTable, selectedDatabase || undefined);
    filterTierManager.resetBaseFilterState(selectedTable, selectedDatabase || undefined);
    dispatch({ type: 'FORCE_QUERY_REFRESH' });
  }, [dispatch, selectedDatabase, selectedTable]);

  return {
    handleResetWorkspace,
    handleSwapAxis,
    handleUndo,
    handleRedo,
    handleIndependentXAxisToggle,
    handleIndependentYAxisToggle,
    handleForceRefresh,
  };
}
