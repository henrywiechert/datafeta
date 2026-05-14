// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useGlobalFilters Hook
 * 
 * Manages global (session-scoped) filters that apply across all sheets.
 * Global filters live in DataSourceContext (single source of truth),
 * while local filters live in VisualizationContext (per-sheet).
 * 
 * Operations:
 * - markFilterAsGlobal: Move filter from local (sheet) to global (session) scope
 * - unmarkGlobalFilter: Copy global filter to all sheets as local, remove from global
 * - removeGlobalFilter: Remove a global filter (gone from all sheets)
 * - isGlobalFilter: Check if a filter is in global scope
 */

import { useCallback } from 'react';
import { useDataSource } from '../contexts/DataSourceContext';
import { useSheetContext } from '../contexts/SheetContext';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { Field, FilterConfig, FilterMetadata } from '../types';
import {
  mergeFilterConfigurations,
  mergeFilterFields,
  mergeFilterMetadata,
} from '../utils/effectiveFilters';

export interface UseGlobalFiltersReturn {
  /** Check if a filter field is in global (session) scope */
  isGlobalFilter: (fieldId: string) => boolean;
  
  /** Mark a filter as global: move from VisualizationContext to DataSourceContext */
  markFilterAsGlobal: (fieldId: string) => void;
  
  /** Unmark a global filter: copy to all sheets as local, remove from DataSourceContext */
  unmarkGlobalFilter: (fieldId: string) => void;
  
  /** Remove a global filter (removes from all sheets) */
  removeGlobalFilter: (fieldId: string) => void;
  
  /** Get merged filter fields (global + local, deduplicated) */
  getMergedFilterFields: () => Field[];
  
  /** Get merged filter configurations (global + local) */
  getMergedFilterConfigurations: () => Record<string, FilterConfig>;
  
  /** Get merged filter metadata (global + local) */
  getMergedFilterMetadata: () => Record<string, FilterMetadata>;
  
  /** Session filter fields from DataSourceContext */
  sessionFilterFields: Field[];
  
  /** Session filter configurations from DataSourceContext */
  sessionFilterConfigurations: Record<string, FilterConfig>;
  
  /** Session applied filter configurations from DataSourceContext */
  sessionAppliedFilterConfigurations: Record<string, FilterConfig>;
  
  /** Session filter metadata from DataSourceContext */
  sessionFilterMetadata: Record<string, FilterMetadata>;
}

export function useGlobalFilters(): UseGlobalFiltersReturn {
  const { 
    dataSource,
    addSessionFilterField,
    removeSessionFilterField,
    setAndApplySessionFilterConfiguration,
    setSessionFilterMetadata,
  } = useDataSource();
  
  const { 
    addFilterToAllSheets, 
    removeFilterFromAllSheets,
  } = useSheetContext();
  
  const { state, dispatch } = useVisualizationContext();
  
  // Check if a filter is in global (session) scope
  const isGlobalFilter = useCallback((fieldId: string): boolean => {
    return dataSource.sessionFilterFields.some(f => f.id === fieldId);
  }, [dataSource.sessionFilterFields]);
  
  // Mark a filter as global: move from local to session scope
  const markFilterAsGlobal = useCallback((fieldId: string) => {
    // Find the field and config in the current visualization context
    const field = state.filterFields.find(f => f.id === fieldId);
    const config = state.filterConfigurations[fieldId];
    const appliedConfig = state.appliedFilterConfigurations[fieldId];
    const metadata = state.filterMetadata[fieldId];
    
    if (!field) {
      console.warn(`Cannot mark filter as global: field ${fieldId} not found`);
      return;
    }
    
    // 1. Add to DataSourceContext (session scope)
    addSessionFilterField(field);
    if (metadata) {
      setSessionFilterMetadata(fieldId, metadata);
    }
    
    // Set and apply the session filter configuration atomically.
    // Use appliedConfig if available (the filter was applied), otherwise use config.
    // This ensures the filter takes effect immediately when marked as global.
    const configToApply = appliedConfig || config;
    if (configToApply) {
      setAndApplySessionFilterConfiguration(fieldId, configToApply);
    }
    
    // 2. Remove from ALL sheets (including current)
    removeFilterFromAllSheets(fieldId);
    
    // 3. Also remove from current VisualizationContext state
    // (removeFilterFromAllSheets updates stored state, but current context needs update too)
    const newFilterFields = state.filterFields.filter(f => f.id !== fieldId);
    dispatch({ type: 'SET_FILTER_FIELDS', payload: newFilterFields });
    dispatch({ type: 'REMOVE_FILTER_CONFIGURATION_SILENT', payload: fieldId });
    
    console.log(`🌐 Filter "${field.columnName}" marked as global (session scope)`);
  }, [
    state.filterFields,
    state.filterConfigurations,
    state.appliedFilterConfigurations,
    state.filterMetadata,
    addSessionFilterField,
    setAndApplySessionFilterConfiguration,
    setSessionFilterMetadata,
    removeFilterFromAllSheets,
    dispatch,
  ]);
  
  // Unmark a global filter: copy to all sheets as local, remove from global
  const unmarkGlobalFilter = useCallback((fieldId: string) => {
    // Find the field and config in DataSourceContext
    const field = dataSource.sessionFilterFields.find(f => f.id === fieldId);
    const config = dataSource.sessionFilterConfigurations[fieldId];
    
    if (!field) {
      console.warn(`Cannot unmark global filter: field ${fieldId} not found in session filters`);
      return;
    }
    
    // Use the config or create a minimal one
    const filterConfig = config || {
      fieldId,
      columnName: field.columnName,
      type: field.flavour === 'continuous' ? 'continuous' : 'discrete',
      scope: 'sheet',
    } as FilterConfig;
    
    // 1. Add to ALL sheets as local filter
    addFilterToAllSheets(field, filterConfig);
    
    // 2. Also add to current VisualizationContext state
    // (addFilterToAllSheets updates stored state, but current context needs update too)
    // Check if the field already exists in the current context
    const existingField = state.filterFields.find(f => f.id === fieldId);
    if (!existingField) {
      dispatch({ type: 'SET_FILTER_FIELDS', payload: [...state.filterFields, field] });
    }
    dispatch({
      type: 'SET_AND_APPLY_FILTER_CONFIGURATION_SILENT',
      payload: { fieldId, config: { ...filterConfig, scope: 'sheet' } }
    });
    
    // 3. Remove from DataSourceContext (session scope)
    removeSessionFilterField(fieldId);
    
    console.log(`📄 Filter "${field.columnName}" unmarked from global (now local on all sheets)`);
  }, [
    dataSource.sessionFilterFields,
    dataSource.sessionFilterConfigurations,
    state.filterFields,
    addFilterToAllSheets,
    removeSessionFilterField,
    dispatch,
  ]);
  
  // Remove a global filter (removes from all sheets)
  const removeGlobalFilter = useCallback((fieldId: string) => {
    const field = dataSource.sessionFilterFields.find(f => f.id === fieldId);
    
    if (!field) {
      console.warn(`Cannot remove global filter: field ${fieldId} not found in session filters`);
      return;
    }
    
    // Remove from DataSourceContext
    removeSessionFilterField(fieldId);
    dispatch({ type: 'FORCE_QUERY_REFRESH' });
    
    console.log(`🗑️ Global filter "${field.columnName}" removed`);
  }, [dataSource.sessionFilterFields, removeSessionFilterField, dispatch]);
  
  // Get merged filter fields (global first, then local, deduplicated)
  const getMergedFilterFields = useCallback((): Field[] => {
    return mergeFilterFields(dataSource.sessionFilterFields, state.filterFields);
  }, [dataSource.sessionFilterFields, state.filterFields]);
  
  // Get merged filter configurations (global configs take precedence for global filters)
  const getMergedFilterConfigurations = useCallback((): Record<string, FilterConfig> => {
    return mergeFilterConfigurations(state.filterConfigurations, dataSource.sessionFilterConfigurations);
  }, [dataSource.sessionFilterConfigurations, state.filterConfigurations]);
  
  // Get merged filter metadata.
  // Vis state may contain metadata for session filters (fetched by useFilterMetadata
  // when session fields are fed into it). Session metadata takes precedence when present
  // (e.g. explicitly set via markFilterAsGlobal).
  const getMergedFilterMetadata = useCallback((): Record<string, FilterMetadata> => {
    return mergeFilterMetadata(state.filterMetadata, dataSource.sessionFilterMetadata);
  }, [dataSource.sessionFilterMetadata, state.filterMetadata]);
  
  return {
    isGlobalFilter,
    markFilterAsGlobal,
    unmarkGlobalFilter,
    removeGlobalFilter,
    getMergedFilterFields,
    getMergedFilterConfigurations,
    getMergedFilterMetadata,
    sessionFilterFields: dataSource.sessionFilterFields,
    sessionFilterConfigurations: dataSource.sessionFilterConfigurations,
    sessionAppliedFilterConfigurations: dataSource.sessionAppliedFilterConfigurations,
    sessionFilterMetadata: dataSource.sessionFilterMetadata,
  };
}
