// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { VisualizationState, VisualizationAction } from '../types';
import { sameFieldArray } from './utils';
import { initialState } from '../initialState';

/**
 * Handles axis-related actions: X/Y fields, field updates, query results, and state reset.
 * Note: Metadata (databases, tables, availableFields) is now managed by DataSourceContext.
 */
export function axisReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'SET_X_AXIS_FIELDS': {
      if (sameFieldArray(state.xAxisFields, action.payload)) return state;
      const isReorderOnly =
        action.payload.length === state.xAxisFields.length &&
        action.payload.every((f) => state.xAxisFields.some((existing) => existing.id === f.id));
      return {
        ...state,
        xAxisFields: action.payload,
        queryVersion: isReorderOnly ? state.queryVersion : state.queryVersion + 1,
      };
    }
    case 'SET_Y_AXIS_FIELDS': {
      if (sameFieldArray(state.yAxisFields, action.payload)) return state;
      const isReorderOnly =
        action.payload.length === state.yAxisFields.length &&
        action.payload.every((f) => state.yAxisFields.some((existing) => existing.id === f.id));
      return {
        ...state,
        yAxisFields: action.payload,
        queryVersion: isReorderOnly ? state.queryVersion : state.queryVersion + 1,
      };
    }
    case 'SWAP_AXIS_FIELDS':
      return { 
        ...state, 
        xAxisFields: state.yAxisFields, 
        yAxisFields: state.xAxisFields,
        categoryTickStyles: initialState.categoryTickStyles,
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
    // Note: Metadata actions (SET_AVAILABLE_FIELDS, SET_DATABASES, SET_TABLES, SET_SELECTED_DATABASE,
    // SET_SELECTED_TABLE, SET_LOADING_METADATA, SET_METADATA_ERROR) have been removed.
    // Metadata is now managed exclusively by DataSourceContext.
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

      // Note: availableFields is now in DataSourceContext, not updated here

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
      // Preserve the last successful query result while updating the error state.
      // This avoids transient chart/legend unmounts during query start where
      // SET_QUERY_ERROR is used with a null payload to clear prior errors.
      return { ...state, queryError: action.payload };
    case 'RESTORE_CACHED_QUERY_RESULT':
      // Restore cached query result without incrementing queryVersion
      // This prevents re-querying when the cache is valid
      return { ...state, queryResult: action.payload, queryError: null };
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
    case 'RESET_QUERY_STATE':
      // Clear only query results without touching visualization config (axis fields, filters, etc.)
      // Used on connection change to free memory without losing user's visualization setup
      return { ...state, queryResult: null, queryError: null };
    case 'TABLE_JOINS_UNIONS_MODIFIED':
      return { ...state, queryVersion: state.queryVersion + 1 };
    case 'FORCE_QUERY_REFRESH':
      // Used after metadata loads to ensure query execution is triggered
      // (e.g., when loading a snapshot with pre-populated axis fields)
      return { ...state, queryVersion: state.queryVersion + 1 };
    case 'SET_GANTT_ZOOM_RANGE':
      // Update Gantt zoom range without triggering re-query
      // (zoom is purely a visual operation on existing data)
      return { ...state, ganttZoomRange: action.payload };
    default:
      return null; // Not handled by this reducer
  }
}

