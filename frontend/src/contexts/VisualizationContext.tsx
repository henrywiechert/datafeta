import React, { createContext, useContext, useReducer, ReactNode, useRef, useCallback } from 'react';
import { Field, Database, Table, QueryResult } from '../types';
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
      | { type: 'RESET_LOADING_STATES' };

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
    case 'UPDATE_FIELD':
      return {
        ...state,
        xAxisFields: state.xAxisFields.map(f => f.id === action.payload.id ? action.payload : f),
        yAxisFields: state.yAxisFields.map(f => f.id === action.payload.id ? action.payload : f),
        availableFields: state.availableFields.map(f => f.id === action.payload.id ? action.payload : f),
      };
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
      };
    case 'RESET_LOADING_STATES':
      return {
        ...state,
        isLoadingQuery: false,
        isLoadingRendering: false,
        showLoadingModal: false,
        loadingOperationType: null,
        loadingStartTime: null,
        canCancelOperation: false,
      };
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
  completeOperation: () => void;
  cancelOperation: () => void;
  // Timeout management
  timeoutRefs: React.MutableRefObject<{ [key: string]: NodeJS.Timeout | null }>;
}

// Create context
const VisualizationContext = createContext<VisualizationContextType | undefined>(undefined);

// Provider component
interface VisualizationProviderProps {
  children: ReactNode;
}

export function VisualizationProvider({ children }: VisualizationProviderProps) {
  const [state, dispatch] = useReducer(visualizationReducer, initialState);
  const timeoutRefs = useRef<{ [key: string]: NodeJS.Timeout | null }>({});

  // Start an operation with timeout handling
  const startOperation = useCallback((operationType: LoadingOperationType, canCancel: boolean = true) => {
    console.log(`🚀 Starting ${operationType} operation`);
    
    // Clear any existing timeout for this operation
    if (timeoutRefs.current[operationType]) {
      clearTimeout(timeoutRefs.current[operationType]!);
    }

    // Set loading state
    dispatch({ type: 'SET_LOADING_START_TIME', payload: Date.now() });
    
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
      console.log(`🔔 Showing modal for ${operationType} operation`);
      dispatch({ 
        type: 'SET_LOADING_MODAL', 
        payload: { show: true, operationType, canCancel } 
      });
    }, timeoutMs);
  }, []);

  // Complete an operation
  const completeOperation = useCallback(() => {
    console.log('✅ Operation completed');
    
    // Clear all timeouts
    Object.values(timeoutRefs.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    timeoutRefs.current = {};

    // Reset loading states
    dispatch({ type: 'RESET_LOADING_STATES' });
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