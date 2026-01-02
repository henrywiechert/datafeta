import { VisualizationState, VisualizationAction } from '../types';
import { sameFieldArray } from './utils';
import { initialState } from '../initialState';

/**
 * Handles axis-related actions: X/Y fields, available fields, databases, tables,
 * field updates, query results, and state reset.
 */
export function axisReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'SET_X_AXIS_FIELDS': {
      if (sameFieldArray(state.xAxisFields, action.payload)) return state;
      const isRemovalOnly = action.payload.every(f => state.xAxisFields.some(existing => existing.id === f.id));
      return { 
        ...state, 
        xAxisFields: action.payload, 
        queryVersion: isRemovalOnly ? state.queryVersion : state.queryVersion + 1 
      };
    }
    case 'SET_Y_AXIS_FIELDS': {
      if (sameFieldArray(state.yAxisFields, action.payload)) return state;
      const isRemovalOnly = action.payload.every(f => state.yAxisFields.some(existing => existing.id === f.id));
      return { 
        ...state, 
        yAxisFields: action.payload, 
        queryVersion: isRemovalOnly ? state.queryVersion : state.queryVersion + 1 
      };
    }
    case 'SWAP_AXIS_FIELDS':
      return { 
        ...state, 
        xAxisFields: state.yAxisFields, 
        yAxisFields: state.xAxisFields
      };
    case 'MOVE_FIELD_BETWEEN_AXES': {
      const { fieldId, fromAxis, toAxis, insertIndex } = action.payload;
      const sourceFields = fromAxis === 'x' ? state.xAxisFields : state.yAxisFields;
      const targetFields = toAxis === 'x' ? state.xAxisFields : state.yAxisFields;
      
      const fieldToMove = sourceFields.find(f => f.id === fieldId);
      if (!fieldToMove) return state;
      
      const fieldAlreadyInTarget = targetFields.some(f => f.id === fieldId);
      if (fieldAlreadyInTarget) return state;
      
      const newSourceFields = sourceFields.filter(f => f.id !== fieldId);
      const newTargetFields = [...targetFields];
      if (insertIndex !== undefined) {
        newTargetFields.splice(insertIndex, 0, fieldToMove);
      } else {
        newTargetFields.push(fieldToMove);
      }
      
      return {
        ...state,
        xAxisFields: fromAxis === 'x' ? newSourceFields : toAxis === 'x' ? newTargetFields : state.xAxisFields,
        yAxisFields: fromAxis === 'y' ? newSourceFields : toAxis === 'y' ? newTargetFields : state.yAxisFields
      };
    }
    case 'SET_AVAILABLE_FIELDS':
      return { ...state, availableFields: action.payload };
    case 'SET_DATABASES':
      return { ...state, databases: action.payload };
    case 'SET_TABLES':
      return { ...state, tables: action.payload };
    case 'SET_SELECTED_DATABASE':
      if (state.selectedDatabase === action.payload) return state;
      return { ...state, selectedDatabase: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_SELECTED_TABLE':
      if (state.selectedTable === action.payload) return state;
      return { ...state, selectedTable: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_LOADING_METADATA':
      return { ...state, isLoadingMetadata: action.payload };
    case 'SET_METADATA_ERROR':
      return { ...state, metadataError: action.payload };
    case 'UPDATE_FIELD': {
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

      const colorChanged = !!(state.colorField && state.colorField.id === updated.id);
      const sizeChanged = !!(state.sizeField && state.sizeField.id === updated.id);

      let labelsChanged = false;
      const newLabels = state.labelFields.map((f) => {
        if (f.id === updated.id) {
          labelsChanged = true;
          return updated;
        }
        return f;
      });

      let tooltipChanged = false;
      const newTooltip = state.tooltipFields.map((f) => {
        if (f.id === updated.id) {
          tooltipChanged = true;
          return updated;
        }
        return f;
      });

      let filterChanged = false;
      const newFilters = state.filterFields.map((f) => {
        if (f.id === updated.id) {
          filterChanged = true;
          return updated;
        }
        return f;
      });

      const bumped = xChanged || yChanged || 
        colorChanged ||
        sizeChanged ||
        labelsChanged ||
        tooltipChanged ||
        filterChanged;
      
      return {
        ...state,
        xAxisFields: xChanged ? newX : state.xAxisFields,
        yAxisFields: yChanged ? newY : state.yAxisFields,
        availableFields: availChanged ? newAvail : state.availableFields,
        colorField: colorChanged ? updated : state.colorField,
        sizeField: sizeChanged ? updated : state.sizeField,
        labelFields: labelsChanged ? newLabels : state.labelFields,
        tooltipFields: tooltipChanged ? newTooltip : state.tooltipFields,
        filterFields: filterChanged ? newFilters : state.filterFields,
        queryVersion: bumped ? state.queryVersion + 1 : state.queryVersion,
      };
    }
    case 'SET_QUERY_RESULT':
      return { ...state, queryResult: action.payload, queryError: null };
    case 'SET_QUERY_ERROR':
      return { ...state, queryResult: null, queryError: action.payload };
    case 'SET_INDEPENDENT_DOMAIN': {
      const { axis, independent } = action.payload;
      const current = state.independentDomains?.[axis];
      if (current === independent) return state;
      return {
        ...state,
        independentDomains: {
          ...state.independentDomains,
          [axis]: independent,
        },
      };
    }
    case 'RESET_STATE':
      return initialState;
    case 'TABLE_JOINS_UNIONS_MODIFIED':
      return { ...state, queryVersion: state.queryVersion + 1 };
    case 'FORCE_QUERY_REFRESH':
      // Used after metadata loads to ensure query execution is triggered
      // (e.g., when loading a snapshot with pre-populated axis fields)
      return { ...state, queryVersion: state.queryVersion + 1 };
    default:
      return null; // Not handled by this reducer
  }
}

