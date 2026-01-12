import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles undo/redo state restoration.
 */
export function undoRedoReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'RESTORE_UNDOABLE_STATE':
      return {
        ...state,
        xAxisFields: action.payload.xAxisFields,
        yAxisFields: action.payload.yAxisFields,
        filterFields: action.payload.filterFields,
        filterConfigurations: action.payload.filterConfigurations,
        appliedFilterConfigurations: action.payload.appliedFilterConfigurations,
        colorField: action.payload.colorField,
        colorScheme: action.payload.colorScheme,
        colorBias: action.payload.colorBias,
        sizeField: action.payload.sizeField,
        sizeRange: action.payload.sizeRange,
        manualSize: action.payload.manualSize,
        independentDomains: action.payload.independentDomains ?? state.independentDomains,
        virtualColumns: action.payload.virtualColumns,
        virtualColumnFieldPreferences: action.payload.virtualColumnFieldPreferences || {},
        fieldOverrides: action.payload.fieldOverrides || {},
        globalChartType: action.payload.globalChartType ?? null,
        queryVersion: state.queryVersion + 1,
      };
    default:
      return null; // Not handled by this reducer
  }
}

