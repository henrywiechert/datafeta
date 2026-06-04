// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { createContext, useReducer, ReactNode, useRef, useCallback, useMemo } from 'react';
import { Field, FilterConfig, VisualizationStateSnapshot } from '../../types';
import { getTimeoutForOperation } from '../../config/loadingConfig';
import { VisualizationState, VisualizationAction, LoadingOperationType, ChartTypeParams } from './types';
import { initialState } from './initialState';
import { visualizationReducer } from './reducers';
import { PERSISTED_STATE_KEYS } from './persistedKeys';
import { DistributionVariant, LineVariant, TableCellMode } from '../../types';
import { resetBus } from '../../services/resetBus';

/**
 * Legacy flat chart-type param fields persisted in older sheet snapshots, before
 * they were grouped under `chartTypeParams`. Read for backward-compatible load.
 *
 * Exported for direct testing of the migration helper.
 */
export interface LegacyChartTypeParamFields {
  chartTypeParams?: Partial<ChartTypeParams>;
  lineVariant?: LineVariant;
  areaFillOpacity?: number;
  distributionVariant?: DistributionVariant;
  tableCellMode?: TableCellMode;
  tablePage?: number;
}

/**
 * Resolve `chartTypeParams` from an incoming snapshot, supporting both the new
 * grouped shape and the legacy flat fields, falling back to defaults. New
 * sheets carry a full `chartTypeParams`; older sheets carry flat fields.
 *
 * Exported so the migration contract can be exercised directly by tests
 * without rendering the provider.
 */
export function resolveChartTypeParams(
  base: ChartTypeParams,
  source: LegacyChartTypeParamFields | undefined,
): ChartTypeParams {
  const grouped = source?.chartTypeParams;
  return {
    density: grouped?.density ?? base.density,
    line: {
      variant: grouped?.line?.variant ?? source?.lineVariant ?? base.line.variant,
      areaFillOpacity:
        grouped?.line?.areaFillOpacity ?? source?.areaFillOpacity ?? base.line.areaFillOpacity,
      colorMode: grouped?.line?.colorMode ?? base.line.colorMode ?? 'alongPath',
    },
    distribution: {
      variant: grouped?.distribution?.variant ?? source?.distributionVariant ?? base.distribution.variant,
    },
    table: {
      cellMode: grouped?.table?.cellMode ?? source?.tableCellMode ?? base.table.cellMode,
      page: grouped?.table?.page ?? source?.tablePage ?? base.table.page,
    },
  };
}

// Context interface
export interface VisualizationContextType {
  state: VisualizationState;
  dispatch: React.Dispatch<VisualizationAction>;
  startOperation: (operationType: LoadingOperationType, canCancel?: boolean) => void;
  completeOperation: (operationType: LoadingOperationType) => void;
  cancelOperation: () => void;
  timeoutRefs: React.MutableRefObject<{ [key: string]: NodeJS.Timeout | null }>;
  getUndoableSnapshot: () => VisualizationStateSnapshot;
}

// Create context
export const VisualizationContext = createContext<VisualizationContextType | undefined>(undefined);

// Provider component props
interface VisualizationProviderProps {
  children: ReactNode;
  initialState?: Partial<VisualizationState>;
}

function normalizeFilterConfigKeys(
  filterFields: Field[] | undefined,
  filterConfigurations: Record<string, FilterConfig> | undefined
): Record<string, FilterConfig> {
  if (!filterFields || filterFields.length === 0) return filterConfigurations || {};
  if (!filterConfigurations) return {};

  const byId = new Map(filterFields.map((f) => [f.id, f]));
  const byColumn = new Map(filterFields.map((f) => [f.columnName, f]));

  const normalized: Record<string, FilterConfig> = {};

  for (const [key, cfg] of Object.entries(filterConfigurations)) {
    // Already keyed by fieldId and consistent
    const direct = byId.get(key) ?? byId.get(cfg.fieldId);
    if (direct) {
      // Measure filters use an aggregation alias as columnName (e.g. "AVG(col)"), not the raw
      // field columnName — preserve it so the HAVING clause can match the correct measure alias.
      const columnName = cfg.type === 'measure' ? cfg.columnName : direct.columnName;
      normalized[direct.id] = { ...cfg, fieldId: direct.id, columnName };
      continue;
    }

    // Legacy / mixed cases: keyed by columnName, or config.fieldId stored as columnName
    const byCol =
      byColumn.get(key) ??
      byColumn.get(cfg.columnName) ??
      byColumn.get(cfg.fieldId);

    if (byCol) {
      const columnName = cfg.type === 'measure' ? cfg.columnName : byCol.columnName;
      normalized[byCol.id] = { ...cfg, fieldId: byCol.id, columnName };
      continue;
    }

    // Fallback: keep entry as-is (still useful for query builder which uses Object.values)
    normalized[key] = cfg;
  }

  return normalized;
}

export function VisualizationProvider({ children, initialState: initialStateProp }: VisualizationProviderProps) {
  // Merge the default initial state with any provided initial state
  const mergedInitialState = React.useMemo(() => {
    const merged = {
      ...initialState,
      ...initialStateProp,
      optimizationSettings: {
        ...initialState.optimizationSettings,
        ...(initialStateProp?.optimizationSettings || {}),
      },
    };

    // Normalize saved filter config maps (some older snapshots were keyed by columnName instead of fieldId).
    // The query layer uses Object.values(filterConfigurations) so charts can still render correctly,
    // but the UI expects filterConfigurations[field.id].
    return {
      ...merged,
      // Migrate legacy flat chart-type params (lineVariant, distributionVariant, …)
      // into the grouped chartTypeParams container, filling defaults.
      chartTypeParams: resolveChartTypeParams(
        initialState.chartTypeParams,
        initialStateProp as LegacyChartTypeParamFields | undefined,
      ),
      filterConfigurations: normalizeFilterConfigKeys(merged.filterFields, merged.filterConfigurations),
      appliedFilterConfigurations: normalizeFilterConfigKeys(merged.filterFields, merged.appliedFilterConfigurations),
    };
  }, [initialStateProp]);

  const [state, dispatch] = useReducer(visualizationReducer, mergedInitialState);
  const timeoutRefs = useRef<{ [key: string]: NodeJS.Timeout | null }>({});

  // Start an operation with timeout handling
  const startOperation = useCallback((operationType: LoadingOperationType, canCancel: boolean = true) => {
    // Clear any existing timeout for this operation
    if (timeoutRefs.current[operationType]) {
      clearTimeout(timeoutRefs.current[operationType]!);
    }

    const now = Date.now();
    dispatch({ type: 'SET_LOADING_START_TIME', payload: now });
    dispatch({ type: 'SET_OPERATION_START_TIME', payload: { op: operationType, time: now } });
    dispatch({ type: 'ADD_ACTIVE_OPERATION', payload: operationType });
    
    switch (operationType) {
      case 'query':
        dispatch({ type: 'SET_LOADING_QUERY', payload: true });
        break;
      case 'rendering':
        dispatch({ type: 'SET_LOADING_RENDERING', payload: true });
        break;
      case 'metadata':
        // Note: Metadata loading state is now managed by DataSourceContext
        // The 'metadata' operation type is kept for modal/timeout handling
        break;
    }

    // Set timeout to show modal
    const timeoutMs = getTimeoutForOperation(operationType);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[VisualizationContext] startOperation(${operationType}): will show modal after ${timeoutMs}ms`);
    }
    
    timeoutRefs.current[operationType] = setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[VisualizationContext] Modal timeout fired for ${operationType} after ${timeoutMs}ms`);
      }
      dispatch({ type: 'ENSURE_PRIMARY_OPERATION', payload: operationType });
      dispatch({ type: 'REQUEST_SHOW_MODAL', payload: { operationType, canCancel } });
    }, timeoutMs);
  }, []);

  // Complete an operation
  const completeOperation = useCallback((operationType: LoadingOperationType) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[VisualizationContext] completeOperation(${operationType})`);
    }
    
    // Clear only the specific timeout
    if (timeoutRefs.current[operationType]) {
      clearTimeout(timeoutRefs.current[operationType]!);
      timeoutRefs.current[operationType] = null;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[VisualizationContext] Cleared timeout for ${operationType}`);
      }
    }

    dispatch({ type: 'REMOVE_ACTIVE_OPERATION', payload: operationType });
    dispatch({ type: 'COMPLETE_SPECIFIC_OPERATION', payload: operationType });
  }, []);

  // Cancel an operation
  const cancelOperation = useCallback(() => {
    console.log('❌ Operation cancelled');
    
    // Clear all timeouts
    Object.values(timeoutRefs.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    timeoutRefs.current = {};

    dispatch({ type: 'CANCEL_OPERATION' });
  }, []);

  // Cleanup timeouts on unmount
  React.useEffect(() => {
    return () => {
      Object.values(timeoutRefs.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  // Listen for global connection reset events (ConnectionContext lives above
  // the per-sheet VisualizationProvider, so it can't dispatch directly).
  React.useEffect(() => {
    return resetBus.subscribe('connection:reset', () => {
      dispatch({ type: 'RESET_QUERY_STATE' });
    });
  }, []);

  // Get undoable state snapshot. Both the captured keys and the restore logic
  // (undoRedoReducer) are driven by PERSISTED_STATE_KEYS, so adding a persisted
  // setting only requires updating that single list.
  const snapshotDeps = PERSISTED_STATE_KEYS.map((key) => state[key]);
  const getUndoableSnapshot = useCallback(
    (): VisualizationStateSnapshot =>
      Object.fromEntries(
        PERSISTED_STATE_KEYS.map((key) => [key, state[key]]),
      ) as unknown as VisualizationStateSnapshot,
    // REASON: snapshotDeps is a dynamic array derived from PERSISTED_STATE_KEYS — ESLint can't statically verify it, but it is the correct dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    snapshotDeps,
  );

  return (
    <VisualizationContext.Provider value={useMemo(() => ({
      state, 
      dispatch, 
      startOperation, 
      completeOperation, 
      cancelOperation, 
      timeoutRefs,
      getUndoableSnapshot
    }), [state, startOperation, completeOperation, cancelOperation, getUndoableSnapshot])}>
      {children}
    </VisualizationContext.Provider>
  );
}

