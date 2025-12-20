import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles field overrides and global chart type actions.
 */
export function overridesReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'SET_FIELD_OVERRIDES':
      return { ...state, fieldOverrides: action.payload };
    case 'UPDATE_FIELD_OVERRIDE': {
      const { fieldId, override } = action.payload;
      const existing = state.fieldOverrides[fieldId] || {};
      const affectsQuery = 
        'colorField' in override || 
        'colorFieldId' in override || 
        'sizeField' in override || 
        'sizeFieldId' in override || 
        'labelFields' in override;
      
      return {
        ...state,
        fieldOverrides: {
          ...state.fieldOverrides,
          [fieldId]: { ...existing, ...override },
        },
        queryVersion: affectsQuery ? state.queryVersion + 1 : state.queryVersion,
      };
    }
    case 'CLEAR_FIELD_OVERRIDE': {
      const existingOverride = state.fieldOverrides[action.payload.fieldId];
      const affectsQuery = existingOverride && (
        existingOverride.colorField || 
        existingOverride.colorFieldId || 
        existingOverride.sizeField || 
        existingOverride.sizeFieldId || 
        existingOverride.labelFields
      );
      
      const next = { ...state.fieldOverrides };
      delete next[action.payload.fieldId];
      return {
        ...state,
        fieldOverrides: next,
        queryVersion: affectsQuery ? state.queryVersion + 1 : state.queryVersion,
      };
    }
    case 'SET_GLOBAL_CHART_TYPE':
      return { ...state, globalChartType: action.payload };
    default:
      return null; // Not handled by this reducer
  }
}

