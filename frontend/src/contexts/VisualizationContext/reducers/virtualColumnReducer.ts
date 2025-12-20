import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles virtual column actions: create, update, remove, and preferences.
 */
export function virtualColumnReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'SET_VIRTUAL_COLUMNS': {
      const sameLen = state.virtualColumns.length === action.payload.length;
      const sameNames = sameLen && state.virtualColumns.every((vc, i) => 
        vc.name === action.payload[i].name && vc.expression === action.payload[i].expression
      );
      if (sameNames) return state;
      return { ...state, virtualColumns: action.payload, queryVersion: state.queryVersion + 1 };
    }
    case 'ADD_VIRTUAL_COLUMN':
      return { 
        ...state, 
        virtualColumns: [...state.virtualColumns, action.payload], 
        queryVersion: state.queryVersion + 1 
      };
    case 'UPDATE_VIRTUAL_COLUMN': {
      const newColumns = [...state.virtualColumns];
      const prev = newColumns[action.payload.index];
      newColumns[action.payload.index] = action.payload.column;
      const changed = !prev || prev.name !== action.payload.column.name || prev.expression !== action.payload.column.expression;
      return { 
        ...state, 
        virtualColumns: newColumns, 
        queryVersion: changed ? state.queryVersion + 1 : state.queryVersion 
      };
    }
    case 'REMOVE_VIRTUAL_COLUMN': {
      if (action.payload < 0 || action.payload >= state.virtualColumns.length) return state;
      const removedColumn = state.virtualColumns[action.payload];
      const newPreferences = { ...state.virtualColumnFieldPreferences };
      delete newPreferences[removedColumn.name];
      return { 
        ...state, 
        virtualColumns: state.virtualColumns.filter((_, i) => i !== action.payload),
        virtualColumnFieldPreferences: newPreferences,
        queryVersion: state.queryVersion + 1,
      };
    }
    case 'UPDATE_VIRTUAL_COLUMN_FIELD_PREFERENCE': {
      return {
        ...state,
        virtualColumnFieldPreferences: {
          ...state.virtualColumnFieldPreferences,
          [action.payload.columnName]: {
            ...state.virtualColumnFieldPreferences[action.payload.columnName],
            ...action.payload.preference,
          },
        },
      };
    }
    default:
      return null; // Not handled by this reducer
  }
}

