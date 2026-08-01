// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useUndoRedo } from './useUndoRedo';
import { useGlobalFilters } from './useGlobalFilters';
import { useFilterConfigWriter } from './useFilterConfigWriter';
import { FilterConfig } from '../types';
import {
  buildEffectiveFilterState,
  EffectiveFilterState,
  isSessionFilter,
} from '../utils/scopedFilters';

export interface UseFilterControllerReturn {
  effective: EffectiveFilterState;
  isSessionFilter: (fieldId: string) => boolean;
  removeFilter: (fieldId: string) => void;
  updateFilterConfig: (fieldId: string, config: FilterConfig) => void;
  applyFilters: () => void;
  markAsSession: (fieldId: string) => void;
  markAsSheet: (fieldId: string) => void;
  toggleFilterDisabled: (fieldId: string) => void;
}

export function useFilterController(): UseFilterControllerReturn {
  const dataSourceContext = useDataSource();
  const { dataSource } = dataSourceContext;
  const { state, dispatch, getUndoableSnapshot } = useVisualizationContext();
  const { recordAction } = useUndoRedo();
  const writeFilterConfig = useFilterConfigWriter();
  const {
    markFilterAsGlobal,
    unmarkGlobalFilter,
    removeGlobalFilter,
  } = useGlobalFilters();

  // Refs so remove/update callbacks stay stable for memoized FieldsPanel while
  // always reading the latest filterFields / session field list (avoids drag-remove
  // resurrecting chips via a stale SET_FILTER_FIELDS payload).
  const filterFieldsRef = useRef(state.filterFields);
  filterFieldsRef.current = state.filterFields;
  const sessionFilterFieldsRef = useRef(dataSource.sessionFilterFields);
  sessionFilterFieldsRef.current = dataSource.sessionFilterFields;
  const removeGlobalFilterRef = useRef(removeGlobalFilter);
  removeGlobalFilterRef.current = removeGlobalFilter;
  const dataSourceContextRef = useRef(dataSourceContext);
  dataSourceContextRef.current = dataSourceContext;

  // Config edits write straight through to the draft layer, so the undo snapshot has
  // to be taken on the first edit of a batch — by Apply time the draft already holds
  // the new values. A fresh appliedFilterConfigurations object means the batch ended
  // (Apply, filter removal, or an undo/redo restore), so the next edit records again.
  const draftDirtyRef = useRef(false);
  useEffect(() => {
    draftDirtyRef.current = false;
  }, [state.appliedFilterConfigurations]);

  const effective = useMemo(
    () => buildEffectiveFilterState({
      sheetFields: state.filterFields,
      sessionFields: dataSource.sessionFilterFields,
      sheetConfigurations: state.filterConfigurations,
      sessionConfigurations: dataSource.sessionFilterConfigurations,
      sheetMetadata: state.filterMetadata,
      sessionMetadata: dataSource.sessionFilterMetadata,
      disabledFilterIds: state.disabledFilterIds,
    }),
    [
      state.filterFields,
      dataSource.sessionFilterFields,
      state.filterConfigurations,
      dataSource.sessionFilterConfigurations,
      state.filterMetadata,
      dataSource.sessionFilterMetadata,
      state.disabledFilterIds,
    ],
  );

  const isFilterInSessionScope = useCallback(
    (fieldId: string) => isSessionFilter(fieldId, dataSource.sessionFilterFields),
    [dataSource.sessionFilterFields],
  );

  const removeFilter = useCallback((fieldId: string) => {
    if (isSessionFilter(fieldId, sessionFilterFieldsRef.current)) {
      removeGlobalFilterRef.current(fieldId);
      return;
    }

    recordAction(getUndoableSnapshot());
    dispatch({
      type: 'SET_FILTER_FIELDS',
      payload: filterFieldsRef.current.filter((field) => field.id !== fieldId),
    });
    dispatch({ type: 'REMOVE_FILTER_CONFIGURATION', payload: fieldId });
  }, [dispatch, getUndoableSnapshot, recordAction]);

  const updateFilterConfig = useCallback((fieldId: string, config: FilterConfig) => {
    if (!draftDirtyRef.current) {
      draftDirtyRef.current = true;
      recordAction(getUndoableSnapshot());
    }
    writeFilterConfig(fieldId, config);
  }, [getUndoableSnapshot, recordAction, writeFilterConfig]);

  const applyFilters = useCallback(() => {
    // The pre-edit snapshot was already recorded by the first updateFilterConfig call.
    dispatch({ type: 'APPLY_FILTERS' });
    dataSourceContextRef.current.applySessionFilters();
  }, [dispatch]);

  const toggleFilterDisabled = useCallback((fieldId: string) => {
    dispatch({ type: 'TOGGLE_FILTER_DISABLED', payload: fieldId });
  }, [dispatch]);

  return {
    effective,
    isSessionFilter: isFilterInSessionScope,
    removeFilter,
    updateFilterConfig,
    applyFilters,
    markAsSession: markFilterAsGlobal,
    markAsSheet: unmarkGlobalFilter,
    toggleFilterDisabled,
  };
}
