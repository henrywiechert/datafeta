import React, { createContext, useContext, useReducer, ReactNode, useRef, useCallback } from 'react';
import { Field, Database, Table, QueryResult, FilterConfig, FilterMetadata } from '../types';
import { getTimeoutForOperation } from '../config/loadingConfig';

// Define loading operation types
export type LoadingOperationType = 'query' | 'rendering' | 'metadata';

// Define the state interface
interface VisualizationState {
  xAxisFields: Field[];
  yAxisFields: Field[];
  availableFields: Field[];
  databases: Database[];
  tables: Table[];
  selectedDatabase: string;
  selectedTable: string;
  isLoadingMetadata: boolean;
  metadataError: string | null;
  queryResult: QueryResult | null;
  queryError: string | null;
  // New loading states
  isLoadingQuery: boolean;
  isLoadingRendering: boolean;
  showLoadingModal: boolean;
  loadingOperationType: LoadingOperationType | null;
  loadingStartTime: number | null;
  canCancelOperation: boolean;
  // Filter states
  filterFields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  filterMetadata: Record<string, FilterMetadata>;
  appliedFilterConfigurations: Record<string, FilterConfig>; // Actually applied filters
  // Color encoding state
  colorField: Field | null;
  colorScheme: string;
  // Size encoding state
  sizeField: Field | null;
  sizeRange: [number, number]; // Min and max size
  manualSize: number; // Used when no field is present
  // --- Per-operation timing (phase 1 introduction) ---
  operationStartTimes: Record<LoadingOperationType, number | null>; // individual start times
  activeOperations: LoadingOperationType[]; // active operations list
  modalPrimaryOperation: LoadingOperationType | null; // chosen operation for modal display
}

// Define action types
type VisualizationAction =
  | { type: 'SET_X_AXIS_FIELDS'; payload: Field[] }
  | { type: 'SET_Y_AXIS_FIELDS'; payload: Field[] }
  | { type: 'SET_AVAILABLE_FIELDS'; payload: Field[] }
  | { type: 'SET_DATABASES'; payload: Database[] }
  | { type: 'SET_TABLES'; payload: Table[] }
  | { type: 'SET_SELECTED_DATABASE'; payload: string }
  | { type: 'SET_SELECTED_TABLE'; payload: string }
  | { type: 'SET_LOADING_METADATA'; payload: boolean }
  | { type: 'SET_METADATA_ERROR'; payload: string | null }
  | { type: 'UPDATE_FIELD'; payload: Field }
  | { type: 'SET_QUERY_RESULT'; payload: QueryResult | null }
  | { type: 'SET_QUERY_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' }
  // New action types
  | { type: 'SET_LOADING_QUERY'; payload: boolean }
  | { type: 'SET_LOADING_RENDERING'; payload: boolean }
  | { type: 'SET_LOADING_MODAL'; payload: { show: boolean; operationType?: LoadingOperationType; canCancel?: boolean } }
  | { type: 'SET_LOADING_START_TIME'; payload: number | null }
  | { type: 'CANCEL_OPERATION' }
  | { type: 'COMPLETE_SPECIFIC_OPERATION'; payload: LoadingOperationType; }
  | { type: 'RESET_LOADING_STATES' }
  | { type: 'SET_OPERATION_START_TIME'; payload: { op: LoadingOperationType; time: number } }
  | { type: 'ADD_ACTIVE_OPERATION'; payload: LoadingOperationType }
  | { type: 'REMOVE_ACTIVE_OPERATION'; payload: LoadingOperationType }
  | { type: 'SET_MODAL_PRIMARY_OPERATION'; payload: LoadingOperationType | null }
  // Filter action types
  | { type: 'SET_FILTER_FIELDS'; payload: Field[] }
  | { type: 'SET_FILTER_CONFIGURATION'; payload: { fieldId: string; config: FilterConfig } }
  | { type: 'SET_FILTER_METADATA'; payload: { fieldId: string; metadata: FilterMetadata } }
  | { type: 'REMOVE_FILTER_CONFIGURATION'; payload: string }
  | { type: 'APPLY_FILTERS' }
  // Color encoding action types
  | { type: 'SET_COLOR_FIELD'; payload: Field | null }
  | { type: 'SET_COLOR_SCHEME'; payload: string }
  | { type: 'REMOVE_COLOR_FIELD' }
  // Size encoding action types
  | { type: 'SET_SIZE_FIELD'; payload: Field | null }
  | { type: 'SET_SIZE_RANGE'; payload: [number, number] }
  | { type: 'SET_MANUAL_SIZE'; payload: number }
  | { type: 'REMOVE_SIZE_FIELD' };

// Initial state
const initialState: VisualizationState = {
  xAxisFields: [],
  yAxisFields: [],
  availableFields: [],
  databases: [],
  tables: [],
  selectedDatabase: '',
  selectedTable: '',
  isLoadingMetadata: false,
  metadataError: null,
  queryResult: null,
  queryError: null,
  // New loading states
  isLoadingQuery: false,
  isLoadingRendering: false,
  showLoadingModal: false,
  loadingOperationType: null,
  loadingStartTime: null,
  canCancelOperation: false,
  // Filter states
  filterFields: [],
  filterConfigurations: {},
  filterMetadata: {},
  appliedFilterConfigurations: {},
  // Color encoding state
  colorField: null,
  colorScheme: 'tableau10',
  // Size encoding state
  sizeField: null,
  sizeRange: [4, 20], // Default range for sizes
  manualSize: 10, // Default manual size
  // Per-operation timing defaults
  operationStartTimes: { query: null, rendering: null, metadata: null },
  activeOperations: [],
  modalPrimaryOperation: null,
};

// Reducer function
function visualizationReducer(state: VisualizationState, action: VisualizationAction): VisualizationState {
  switch (action.type) {
    case 'SET_X_AXIS_FIELDS':
      return { ...state, xAxisFields: action.payload };
    case 'SET_Y_AXIS_FIELDS':
      return { ...state, yAxisFields: action.payload };
    case 'SET_AVAILABLE_FIELDS':
      return { ...state, availableFields: action.payload };
    case 'SET_DATABASES':
      return { ...state, databases: action.payload };
    case 'SET_TABLES':
      return { ...state, tables: action.payload };
    case 'SET_SELECTED_DATABASE':
      return { ...state, selectedDatabase: action.payload };
    case 'SET_SELECTED_TABLE':
      return { ...state, selectedTable: action.payload };
    case 'SET_LOADING_METADATA':
      return { ...state, isLoadingMetadata: action.payload };
    case 'SET_METADATA_ERROR':
      return { ...state, metadataError: action.payload };
    case 'UPDATE_FIELD': {
      // Only update arrays that actually contain the field id.
      // This preserves reference equality for x/y axis field arrays when
      // editing fields in the available list (left panel), avoiding chart re-renders.
      const updated = action.payload;

      let xChanged = false;
      const newX = state.xAxisFields.map((f) => {
        if (f.id === updated.id) {
          xChanged = true;
          return updated;
        }
        return f;
      });

      let yChanged = false;
      const newY = state.yAxisFields.map((f) => {
        if (f.id === updated.id) {
          yChanged = true;
          return updated;
        }
        return f;
      });

      let availChanged = false;
      const newAvail = state.availableFields.map((f) => {
        if (f.id === updated.id) {
          availChanged = true;
          return updated;
        }
        return f;
      });

      return {
        ...state,
        xAxisFields: xChanged ? newX : state.xAxisFields,
        yAxisFields: yChanged ? newY : state.yAxisFields,
        availableFields: availChanged ? newAvail : state.availableFields,
      };
    }
    case 'SET_QUERY_RESULT':
      return { ...state, queryResult: action.payload, queryError: null };
    case 'SET_QUERY_ERROR':
      return { ...state, queryResult: null, queryError: action.payload };
    case 'SET_LOADING_QUERY':
      return { ...state, isLoadingQuery: action.payload };
    case 'SET_LOADING_RENDERING':
      return { ...state, isLoadingRendering: action.payload };
    case 'SET_LOADING_MODAL':
      return { 
        ...state, 
        showLoadingModal: action.payload.show,
        loadingOperationType: action.payload.operationType || state.loadingOperationType,
        canCancelOperation: action.payload.canCancel !== undefined ? action.payload.canCancel : state.canCancelOperation
      };
    case 'SET_LOADING_START_TIME':
      return { ...state, loadingStartTime: action.payload };
    case 'SET_OPERATION_START_TIME':
      return { ...state, operationStartTimes: { ...state.operationStartTimes, [action.payload.op]: action.payload.time } };
    case 'ADD_ACTIVE_OPERATION': {
      if (state.activeOperations.includes(action.payload)) return state;
      return { ...state, activeOperations: [...state.activeOperations, action.payload] };
    }
    case 'REMOVE_ACTIVE_OPERATION':
      return { ...state, activeOperations: state.activeOperations.filter(o => o !== action.payload) };
    case 'SET_MODAL_PRIMARY_OPERATION':
      return { ...state, modalPrimaryOperation: action.payload };
    case 'CANCEL_OPERATION':
      return {
        ...state,
        isLoadingQuery: false,
        isLoadingRendering: false,
        isLoadingMetadata: false,
        showLoadingModal: false,
        loadingOperationType: null,
        loadingStartTime: null,
        canCancelOperation: false,
        operationStartTimes: { query: null, rendering: null, metadata: null },
        activeOperations: [],
        modalPrimaryOperation: null,
      };
    case 'COMPLETE_SPECIFIC_OPERATION':
      {
        let updatedState = { ...state };
        switch (action.payload) {
          case 'query':
            updatedState.isLoadingQuery = false;
            break;
          case 'rendering':
            updatedState.isLoadingRendering = false;
            break;
          case 'metadata':
            updatedState.isLoadingMetadata = false;
            break;
        }
        // Only hide modal if all operations are complete
        if (!updatedState.isLoadingQuery && !updatedState.isLoadingRendering && !updatedState.isLoadingMetadata) {
          updatedState.showLoadingModal = false;
          updatedState.loadingOperationType = null;
          updatedState.loadingStartTime = null;
          updatedState.canCancelOperation = false;
          updatedState.modalPrimaryOperation = null;
        }
        return updatedState;
      }
    case 'RESET_LOADING_STATES':
      return {
        ...state,
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
    case 'SET_FILTER_FIELDS':
      return { ...state, filterFields: action.payload };
    case 'SET_FILTER_CONFIGURATION':
      return {
        ...state,
        filterConfigurations: {
          ...state.filterConfigurations,
          [action.payload.fieldId]: action.payload.config,
        },
      };
    case 'SET_FILTER_METADATA':
      return {
        ...state,
        filterMetadata: {
          ...state.filterMetadata,
          [action.payload.fieldId]: action.payload.metadata,
        },
      };
    case 'REMOVE_FILTER_CONFIGURATION':
      {
        const newConfigs = { ...state.filterConfigurations };
        const newMetadata = { ...state.filterMetadata };
        const newApplied = { ...state.appliedFilterConfigurations };
        delete newConfigs[action.payload];
        delete newMetadata[action.payload];
        delete newApplied[action.payload];
        return {
          ...state,
          filterConfigurations: newConfigs,
          filterMetadata: newMetadata,
          appliedFilterConfigurations: newApplied,
        };
      }
    case 'APPLY_FILTERS':
      return {
        ...state,
        appliedFilterConfigurations: { ...state.filterConfigurations },
      };
    case 'SET_COLOR_FIELD':
      return { ...state, colorField: action.payload };
    case 'SET_COLOR_SCHEME':
      return { ...state, colorScheme: action.payload };
    case 'REMOVE_COLOR_FIELD':
      return { ...state, colorField: null };
    case 'SET_SIZE_FIELD':
      return { ...state, sizeField: action.payload };
    case 'SET_SIZE_RANGE':
      return { ...state, sizeRange: action.payload };
    case 'SET_MANUAL_SIZE':
      return { ...state, manualSize: action.payload };
    case 'REMOVE_SIZE_FIELD':
      return { ...state, sizeField: null };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

// Context interface
interface VisualizationContextType {
  state: VisualizationState;
  dispatch: React.Dispatch<VisualizationAction>;
  // New methods for loading management
  startOperation: (operationType: LoadingOperationType, canCancel?: boolean) => void;
  completeOperation: (operationType: LoadingOperationType) => void; // Updated signature
  cancelOperation: () => void;
  // Timeout management
  timeoutRefs: React.MutableRefObject<{ [key: string]: NodeJS.Timeout | null }>;
}

// Create context
const VisualizationContext = createContext<VisualizationContextType | undefined>(undefined);

// Provider component
interface VisualizationProviderProps {
  children: ReactNode;
  initialState?: Partial<VisualizationState>;
}

export function VisualizationProvider({ children, initialState: initialStateProp }: VisualizationProviderProps) {
  // Merge the default initial state with any provided initial state
  const mergedInitialState = React.useMemo(() => {
    const merged = {
      ...initialState,
      ...initialStateProp,
    };
    return merged;
  }, [initialStateProp]);

  const [state, dispatch] = useReducer(visualizationReducer, mergedInitialState);
  const timeoutRefs = useRef<{ [key: string]: NodeJS.Timeout | null }>({});

  // Start an operation with timeout handling
  // startOperation now records both legacy global start time and per-operation time.
  // Legacy fields (loadingStartTime, loadingOperationType) remain for current modal component.
  // New fields (operationStartTimes, activeOperations, modalPrimaryOperation) will support multi-operation modal.
  const startOperation = useCallback((operationType: LoadingOperationType, canCancel: boolean = true) => {
    
    // Clear any existing timeout for this operation
    if (timeoutRefs.current[operationType]) {
      clearTimeout(timeoutRefs.current[operationType]!);
    }

  // Global legacy start time retained for existing modal display
  const now = Date.now();
  dispatch({ type: 'SET_LOADING_START_TIME', payload: now });
  // Record per-operation start time if not already set
  dispatch({ type: 'SET_OPERATION_START_TIME', payload: { op: operationType, time: now } });
  // Track active operation list
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
    
    timeoutRefs.current[operationType] = setTimeout(() => {
      // Choose primary operation if none selected (for future enhancement)
      dispatch({ type: 'SET_MODAL_PRIMARY_OPERATION', payload: operationType });
      dispatch({ 
        type: 'SET_LOADING_MODAL', 
        payload: { show: true, operationType, canCancel } 
      });
    }, timeoutMs);
  }, []);

  // Complete an operation
  // completeOperation updates legacy flags plus removes the operation from new tracking lists.
  const completeOperation = useCallback((operationType: LoadingOperationType) => {
    
    // Clear only the specific timeout
    if (timeoutRefs.current[operationType]) {
      clearTimeout(timeoutRefs.current[operationType]!);
      timeoutRefs.current[operationType] = null; // Mark as cleared
    }

    // Remove from active operations list
    dispatch({ type: 'REMOVE_ACTIVE_OPERATION', payload: operationType });
    // Dispatch action to update specific loading state and potentially hide modal
    dispatch({ type: 'COMPLETE_SPECIFIC_OPERATION', payload: operationType });
    // If the completed op was the primary, clear primary (legacy modal still uses loadingOperationType)
    // Future enhancement will recompute next primary.
    // For now we simply null it to avoid stale references when we begin multi-op UI.
    if (state.modalPrimaryOperation === operationType) {
      dispatch({ type: 'SET_MODAL_PRIMARY_OPERATION', payload: null });
    }
  }, []);

  // Cancel an operation
  const cancelOperation = useCallback(() => {
    console.log('❌ Operation cancelled');
    
    // Clear all timeouts
    Object.values(timeoutRefs.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    timeoutRefs.current = {};

    // Reset states
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

  return (
    <VisualizationContext.Provider value={{ 
      state, 
      dispatch, 
      startOperation, 
      completeOperation, 
      cancelOperation, 
      timeoutRefs
    }}>
      {children}
    </VisualizationContext.Provider>
  );
}

// Custom hook to use the context
export function useVisualizationContext() {
  const context = useContext(VisualizationContext);
  if (context === undefined) {
    throw new Error('useVisualizationContext must be used within a VisualizationProvider');
  }
  return context;
}