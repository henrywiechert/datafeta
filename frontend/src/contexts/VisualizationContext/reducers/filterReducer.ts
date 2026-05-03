import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles filter-related actions: filter fields, configurations, metadata, and application.
 */
export function filterReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  const removeFilterConfiguration = (
    fieldId: string,
    incrementQueryVersion: boolean,
    preserveMetadata: boolean = false,
  ): VisualizationState => {
    const newConfigs = { ...state.filterConfigurations };
    const newApplied = { ...state.appliedFilterConfigurations };
    delete newConfigs[fieldId];
    delete newApplied[fieldId];

    const newMetadata = preserveMetadata
      ? state.filterMetadata
      : (() => {
          const nextMetadata = { ...state.filterMetadata };
          delete nextMetadata[fieldId];
          return nextMetadata;
        })();

    return {
      ...state,
      filterConfigurations: newConfigs,
      filterMetadata: newMetadata,
      appliedFilterConfigurations: newApplied,
      disabledFilterIds: (state.disabledFilterIds ?? []).filter(id => id !== fieldId),
      queryVersion: incrementQueryVersion ? state.queryVersion + 1 : state.queryVersion,
    };
  };

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
    case 'SET_AND_APPLY_FILTER_CONFIGURATION_SILENT':
      return {
        ...state,
        filterConfigurations: {
          ...state.filterConfigurations,
          [action.payload.fieldId]: action.payload.config,
        },
        appliedFilterConfigurations: {
          ...state.appliedFilterConfigurations,
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
    case 'REMOVE_FILTER_CONFIGURATION_SILENT':
      return removeFilterConfiguration(action.payload, false, true);
    case 'REMOVE_FILTER_CONFIGURATION': {
      return removeFilterConfiguration(action.payload, true);
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

