// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles measure group actions.
 * Measure groups are per-sheet (not shared across sheets).
 */
export function measureGroupReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'SET_MEASURE_GROUP_FIELDS': {
      // Skip if no change (same array reference or same content)
      if (state.measureGroupFields === action.payload) return state;
      if (
        state.measureGroupFields.length === action.payload.length &&
        state.measureGroupFields.every((f, i) => f.id === action.payload[i].id)
      ) {
        return state;
      }
      return {
        ...state,
        measureGroupFields: action.payload,
        queryVersion: state.queryVersion + 1,
      };
    }
    case 'ADD_MEASURE_TO_GROUP': {
      const field = action.payload;
      // Skip if already in group
      if (state.measureGroupFields.some(f => f.columnName === field.columnName)) {
        return state;
      }
      return {
        ...state,
        measureGroupFields: [...state.measureGroupFields, field],
        queryVersion: state.queryVersion + 1,
      };
    }
    case 'REMOVE_MEASURES_FROM_GROUP': {
      const fieldIds = new Set(action.payload);
      const nextFields = state.measureGroupFields.filter(f => !fieldIds.has(f.id));
      // Skip if nothing removed
      if (nextFields.length === state.measureGroupFields.length) {
        return state;
      }
      return {
        ...state,
        measureGroupFields: nextFields,
        queryVersion: state.queryVersion + 1,
      };
    }
    case 'CLEAR_MEASURE_GROUP': {
      if (state.measureGroupFields.length === 0) {
        return state;
      }
      return {
        ...state,
        measureGroupFields: [],
        queryVersion: state.queryVersion + 1,
      };
    }
    default:
      return null; // Not handled by this reducer
  }
}
