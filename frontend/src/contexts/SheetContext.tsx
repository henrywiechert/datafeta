import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Sheet, SheetManagerState, SheetAction, VisualizationStateSnapshot } from '../types';

const STORAGE_KEY = 'data-slicer-sheets';

// Helper to create empty visualization state
// Note: These are NOT included because they are shared across all sheets:
// - selectedDatabase, selectedTable (data source selection)
// - availableFields (derived from selected table)
function createEmptyVisualizationState(): VisualizationStateSnapshot {
  return {
    xAxisFields: [],
    yAxisFields: [],
    filterFields: [],
    filterConfigurations: {},
    appliedFilterConfigurations: {},
    colorField: null,
    colorScheme: 'tableau10',
    colorBias: 0,
    sizeField: null,
    sizeRange: [4, 20],
    manualSize: 10,
    tooltipFields: [],
    fieldOverrides: {},
  };
}

// Helper to create a new sheet
function createNewSheet(name: string, state?: Partial<VisualizationStateSnapshot>): Sheet {
  return {
    id: uuidv4(),
    name,
    visualizationState: {
      ...createEmptyVisualizationState(),
      ...state,
    },
    createdAt: Date.now(),
    lastModified: Date.now(),
  };
}

// Initial state with one default sheet
const initialState: SheetManagerState = {
  sheets: [createNewSheet('Sheet 1')],
  activeSheetId: '',
  nextSheetNumber: 2,
};
initialState.activeSheetId = initialState.sheets[0].id;

// Reducer function
function sheetReducer(state: SheetManagerState, action: SheetAction): SheetManagerState {
  switch (action.type) {
    case 'ADD_SHEET': {
      const newSheet = createNewSheet(
        `Sheet ${state.nextSheetNumber}`,
        action.payload?.visualizationState
      );
      return {
        ...state,
        sheets: [...state.sheets, newSheet],
        activeSheetId: newSheet.id,
        nextSheetNumber: state.nextSheetNumber + 1,
      };
    }

    case 'REMOVE_SHEET': {
      // Don't allow removing the last sheet
      if (state.sheets.length === 1) return state;

      const remainingSheets = state.sheets.filter(s => s.id !== action.payload);
      const wasActive = state.activeSheetId === action.payload;
      
      // If we're removing the active sheet, switch to the first remaining sheet
      return {
        ...state,
        sheets: remainingSheets,
        activeSheetId: wasActive ? remainingSheets[0].id : state.activeSheetId,
      };
    }

    case 'RENAME_SHEET': {
      return {
        ...state,
        sheets: state.sheets.map(sheet =>
          sheet.id === action.payload.id
            ? { ...sheet, name: action.payload.name, lastModified: Date.now() }
            : sheet
        ),
      };
    }

    case 'SET_ACTIVE_SHEET': {
      return {
        ...state,
        activeSheetId: action.payload,
      };
    }

    case 'UPDATE_SHEET_STATE': {
      return {
        ...state,
        sheets: state.sheets.map(sheet =>
          sheet.id === action.payload.id
            ? {
                ...sheet,
                visualizationState: {
                  ...sheet.visualizationState,
                  ...action.payload.state,
                },
                lastModified: Date.now(),
              }
            : sheet
        ),
      };
    }

    case 'DUPLICATE_SHEET': {
      const sheetToDuplicate = state.sheets.find(s => s.id === action.payload);
      if (!sheetToDuplicate) return state;

      const duplicatedSheet = createNewSheet(
        `${sheetToDuplicate.name} (Copy)`,
        sheetToDuplicate.visualizationState
      );

      return {
        ...state,
        sheets: [...state.sheets, duplicatedSheet],
        activeSheetId: duplicatedSheet.id,
        nextSheetNumber: state.nextSheetNumber + 1,
      };
    }

    case 'LOAD_SHEETS': {
      if (action.payload.length === 0) return state;
      
      // Find the highest sheet number to continue numbering correctly
      const maxSheetNumber = action.payload.reduce((max, sheet) => {
        const match = sheet.name.match(/^Sheet (\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          return Math.max(max, num);
        }
        return max;
      }, 0);

      return {
        ...state,
        sheets: action.payload,
        activeSheetId: action.payload[0].id,
        nextSheetNumber: maxSheetNumber + 1,
      };
    }

    default:
      return state;
  }
}

// Context interface
interface SheetContextType {
  state: SheetManagerState;
  dispatch: React.Dispatch<SheetAction>;
  activeSheet: Sheet | undefined;
  addSheet: () => void;
  removeSheet: (id: string) => void;
  renameSheet: (id: string, name: string) => void;
  setActiveSheet: (id: string) => void;
  updateActiveSheetState: (state: Partial<VisualizationStateSnapshot>) => void;
  duplicateSheet: (id: string) => void;
}

const SheetContext = createContext<SheetContextType | undefined>(undefined);

// Provider component
export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(sheetReducer, initialState);

  // Load sheets from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.sheets && Array.isArray(parsed.sheets) && parsed.sheets.length > 0) {
          dispatch({ type: 'LOAD_SHEETS', payload: parsed.sheets });
        }
      }
    } catch (error) {
      console.error('Failed to load sheets from localStorage:', error);
    }
  }, []);

  // Save sheets to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sheets: state.sheets }));
    } catch (error) {
      console.error('Failed to save sheets to localStorage:', error);
    }
  }, [state.sheets]);

  const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);

  // Helper functions for easier usage
  const addSheet = useCallback(() => {
    dispatch({ type: 'ADD_SHEET' });
  }, []);

  const removeSheet = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_SHEET', payload: id });
  }, []);

  const renameSheet = useCallback((id: string, name: string) => {
    dispatch({ type: 'RENAME_SHEET', payload: { id, name } });
  }, []);

  const setActiveSheet = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE_SHEET', payload: id });
  }, []);

  const updateActiveSheetState = useCallback((stateUpdate: Partial<VisualizationStateSnapshot>) => {
    if (!state.activeSheetId) return;
    dispatch({
      type: 'UPDATE_SHEET_STATE',
      payload: { id: state.activeSheetId, state: stateUpdate },
    });
  }, [state.activeSheetId]);

  const duplicateSheet = useCallback((id: string) => {
    dispatch({ type: 'DUPLICATE_SHEET', payload: id });
  }, []);

  return (
    <SheetContext.Provider
      value={{
        state,
        dispatch,
        activeSheet,
        addSheet,
        removeSheet,
        renameSheet,
        setActiveSheet,
        updateActiveSheetState,
        duplicateSheet,
      }}
    >
      {children}
    </SheetContext.Provider>
  );
}

// Custom hook to use the context
export function useSheetContext() {
  const context = useContext(SheetContext);
  if (!context) {
    throw new Error('useSheetContext must be used within a SheetProvider');
  }
  return context;
}
