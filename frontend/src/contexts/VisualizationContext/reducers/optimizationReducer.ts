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
