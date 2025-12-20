import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles panel collapse actions.
 */
export function panelReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'TOGGLE_LEFT_PANEL':
      return { ...state, leftPanelCollapsed: !state.leftPanelCollapsed };
    case 'TOGGLE_MIDDLE_PANEL':
      return { ...state, middlePanelCollapsed: !state.middlePanelCollapsed };
    case 'SET_PANEL_COLLAPSED':
      if (action.payload.panel === 'left') {
        return { ...state, leftPanelCollapsed: action.payload.collapsed };
      }
      return { ...state, middlePanelCollapsed: action.payload.collapsed };
    default:
      return null; // Not handled by this reducer
  }
}

