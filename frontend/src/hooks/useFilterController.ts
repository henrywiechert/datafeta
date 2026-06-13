import { useCallback, useMemo } from 'react';
import { useDataSource } from '../contexts/DataSourceContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useUndoRedo } from './useUndoRedo';
import { useGlobalFilters } from './useGlobalFilters';
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
  const {
    markFilterAsGlobal,
    unmarkGlobalFilter,
    removeGlobalFilter,
  } = useGlobalFilters();

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

  const removeSheetFilter = useCallback((fieldId: string) => {
    recordAction(getUndoableSnapshot());
    dispatch({
      type: 'SET_FILTER_FIELDS',
      payload: state.filterFields.filter((field) => field.id !== fieldId),
    });
    dispatch({ type: 'REMOVE_FILTER_CONFIGURATION', payload: fieldId });
  }, [dispatch, getUndoableSnapshot, recordAction, state.filterFields]);

  const removeFilter = useCallback((fieldId: string) => {
    if (isFilterInSessionScope(fieldId)) {
      removeGlobalFilter(fieldId);
      return;
    }
    removeSheetFilter(fieldId);
  }, [isFilterInSessionScope, removeGlobalFilter, removeSheetFilter]);

  const updateFilterConfig = useCallback((fieldId: string, config: FilterConfig) => {
    if (isFilterInSessionScope(fieldId)) {
      dataSourceContext.setSessionFilterConfiguration(fieldId, config);
      return;
    }

    dispatch({
      type: 'SET_FILTER_CONFIGURATION',
      payload: { fieldId, config },
    });
  }, [dataSourceContext, dispatch, isFilterInSessionScope]);

  const applyFilters = useCallback(() => {
    recordAction(getUndoableSnapshot());
    dispatch({ type: 'APPLY_FILTERS' });
    dataSourceContext.applySessionFilters();
  }, [dataSourceContext, dispatch, getUndoableSnapshot, recordAction]);

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
