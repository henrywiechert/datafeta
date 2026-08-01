// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useRecordUndoPoint } from './useRecordUndoPoint';
import { useGlobalFilters } from './useGlobalFilters';
import { useFilterConfigWriter } from './useFilterConfigWriter';
import { FilterConfig } from '../types';
import {
  buildEffectiveFilterState,
  EffectiveFilterState,
  isSessionFilter,
} from '../utils/scopedFilters';
import { hasPendingFilterApply } from '../utils/filterApplyPending';

export interface UseFilterControllerReturn {
  effective: EffectiveFilterState;
  hasPendingApply: boolean;
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
  const { state, dispatch } = useVisualizationContext();
  const recordUndoPoint = useRecordUndoPoint();
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

  const hasPendingApply = useMemo(
    () =>
      hasPendingFilterApply(
        state.filterConfigurations,
        dataSource.sessionFilterConfigurations ?? {},
        state.appliedFilterConfigurations,
        dataSource.sessionAppliedFilterConfigurations ?? {},
      ),
    [
      state.filterConfigurations,
      dataSource.sessionFilterConfigurations,
      state.appliedFilterConfigurations,
      dataSource.sessionAppliedFilterConfigurations,
    ],
  );

  const isFilterInSessionScope = useCallback(
    (fieldId: string) => isSessionFilter(fieldId, dataSource.sessionFilterFields),
    [dataSource.sessionFilterFields],
  );

  // Remove a filter from BOTH scopes for the given id. A field can transiently
  // end up in the sheet store and the session store at the same time (e.g. a
  // stale sheet snapshot resurrected while it was being promoted to global).
  // Clearing only the detected scope would leave the other store's
  // appliedFilterConfigurations orphaned — the panel dedups it away but the
  // query still filters on it. Always clear the sheet store and, when present,
  // the session store too, so no orphaned config can survive a removal.
  const removeFilter = useCallback((fieldId: string) => {
    recordUndoPoint();

    // Always clear the sheet (local) copy. REMOVE_FILTER_CONFIGURATION deletes
    // both filterConfigurations and appliedFilterConfigurations and bumps
    // queryVersion so the query re-runs without the field.
    dispatch({
      type: 'SET_FILTER_FIELDS',
      payload: filterFieldsRef.current.filter((field) => field.id !== fieldId),
    });
    dispatch({ type: 'REMOVE_FILTER_CONFIGURATION', payload: fieldId });

    // Also clear the session (global) copy if the field lives there.
    if (isSessionFilter(fieldId, sessionFilterFieldsRef.current)) {
      removeGlobalFilterRef.current(fieldId);
    }
  }, [dispatch, recordUndoPoint]);

  const updateFilterConfig = useCallback((fieldId: string, config: FilterConfig) => {
    if (!draftDirtyRef.current) {
      draftDirtyRef.current = true;
      recordUndoPoint();
    }
    writeFilterConfig(fieldId, config);
  }, [recordUndoPoint, writeFilterConfig]);

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
    hasPendingApply,
    isSessionFilter: isFilterInSessionScope,
    removeFilter,
    updateFilterConfig,
    applyFilters,
    markAsSession: markFilterAsGlobal,
    markAsSheet: unmarkGlobalFilter,
    toggleFilterDisabled,
  };
}
