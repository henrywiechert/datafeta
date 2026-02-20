import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles chart caption actions.
 * Returns null if the action is not handled by this reducer.
 */
export function captionReducer(
  state: VisualizationState,
  action: VisualizationAction
): VisualizationState | null {
  switch (action.type) {
    case 'SET_CHART_CAPTION':
      return { ...state, chartCaption: action.payload };
    default:
      return null;
  }
}
