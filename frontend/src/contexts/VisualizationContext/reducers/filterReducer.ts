import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles filter-related actions: filter fields, configurations, metadata, and application.
 */
export function filterReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'SET_FILTER_FIELDS':
      return { ...state, filterFields: action.payload };
    case 'SET_FILTER_CONFIGURATION':
      return {
        ...state,
        filterConfigurations: {
          ...state.filterConfigurations,
          [action.payload.fieldId]: action.payload.config,
        },
      };
    case 'SET_FILTER_METADATA':
      return {
        ...state,
        filterMetadata: {
          ...state.filterMetadata,
          [action.payload.fieldId]: action.payload.metadata,
        },
      };
    case 'REMOVE_FILTER_CONFIGURATION': {
      const newConfigs = { ...state.filterConfigurations };
      const newMetadata = { ...state.filterMetadata };
      const newApplied = { ...state.appliedFilterConfigurations };
      delete newConfigs[action.payload];
      delete newMetadata[action.payload];
      delete newApplied[action.payload];
      return {
        ...state,
        filterConfigurations: newConfigs,
        filterMetadata: newMetadata,
        appliedFilterConfigurations: newApplied,
        disabledFilterIds: (state.disabledFilterIds ?? []).filter(id => id !== action.payload),
        queryVersion: state.queryVersion + 1,
      };
    }
    case 'APPLY_FILTERS':
      return {
        ...state,
        appliedFilterConfigurations: { ...state.filterConfigurations },
        queryVersion: state.queryVersion + 1,
      };
    case 'TOGGLE_FILTER_DISABLED': {
      const id = action.payload;
      const current = state.disabledFilterIds ?? [];
      const isDisabled = current.includes(id);
      const next = isDisabled ? current.filter(x => x !== id) : [...current, id];
      return { ...state, disabledFilterIds: next, queryVersion: state.queryVersion + 1 };
    }
    default:
      return null; // Not handled by this reducer
  }
}

