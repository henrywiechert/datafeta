import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Field, Database, Table, QueryResult } from '../types';

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
  | { type: 'RESET_STATE' };

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
}

// Create context
const VisualizationContext = createContext<VisualizationContextType | undefined>(undefined);

// Provider component
interface VisualizationProviderProps {
  children: ReactNode;
}

export function VisualizationProvider({ children }: VisualizationProviderProps) {
  const [state, dispatch] = useReducer(visualizationReducer, initialState);

  return (
    <VisualizationContext.Provider value={{ state, dispatch }}>
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