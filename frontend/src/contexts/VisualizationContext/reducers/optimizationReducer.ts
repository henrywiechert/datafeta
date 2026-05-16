// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles query optimization settings updates.
 */
export function optimizationReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'SET_QUERY_OPTIMIZATION_SETTINGS': {
      return {
        ...state,
        optimizationSettings: action.payload,
        queryVersion: state.queryVersion + 1,
      };
    }
    case 'UPDATE_QUERY_OPTIMIZATION_SETTINGS': {
      return {
        ...state,
        optimizationSettings: {
          ...state.optimizationSettings,
          ...action.payload,
        },
        queryVersion: state.queryVersion + 1,
      };
    }
    default:
      return null;
  }
}
