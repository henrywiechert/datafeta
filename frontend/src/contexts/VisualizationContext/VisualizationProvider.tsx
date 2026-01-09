import React, { createContext, useReducer, ReactNode, useRef, useCallback } from 'react';
import { Field, FilterConfig, VisualizationStateSnapshot } from '../../types';
import { getTimeoutForOperation } from '../../config/loadingConfig';
import { VisualizationState, VisualizationAction, LoadingOperationType } from './types';
import { initialState } from './initialState';
import { visualizationReducer } from './reducers';

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
      normalized[direct.id] = { ...cfg, fieldId: direct.id, columnName: direct.columnName };
      continue;
    }

    // Legacy / mixed cases: keyed by columnName, or config.fieldId stored as columnName
    const byCol =
      byColumn.get(key) ??
      byColumn.get(cfg.columnName) ??
      byColumn.get(cfg.fieldId);

    if (byCol) {
      normalized[byCol.id] = { ...cfg, fieldId: byCol.id, columnName: byCol.columnName };
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
        dispatch({ type: 'SET_LOADING_METADATA', payload: true });
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

  // Get undoable state snapshot
  const getUndoableSnapshot = useCallback(() => {
    return {
      xAxisFields: state.xAxisFields,
      yAxisFields: state.yAxisFields,
      filterFields: state.filterFields,
      filterConfigurations: state.filterConfigurations,
      appliedFilterConfigurations: state.appliedFilterConfigurations,
      colorField: state.colorField,
      colorScheme: state.colorScheme,
      colorBias: state.colorBias,
      sizeField: state.sizeField,
      sizeRange: state.sizeRange,
      manualSize: state.manualSize,
      bandThicknessScale: state.bandThicknessScale,
      independentDomains: state.independentDomains,
      tooltipFields: state.tooltipFields,
      fieldOverrides: state.fieldOverrides,
    };
  }, [
    state.xAxisFields,
    state.yAxisFields,
    state.filterFields,
    state.filterConfigurations,
    state.appliedFilterConfigurations,
    state.colorField,
    state.colorScheme,
    state.colorBias,
    state.sizeField,
    state.sizeRange,
    state.manualSize,
    state.bandThicknessScale,
    state.independentDomains,
    state.tooltipFields,
    state.fieldOverrides,
  ]);

  return (
    <VisualizationContext.Provider value={{ 
      state, 
      dispatch, 
      startOperation, 
      completeOperation, 
      cancelOperation, 
      timeoutRefs,
      getUndoableSnapshot
    }}>
      {children}
    </VisualizationContext.Provider>
  );
}

