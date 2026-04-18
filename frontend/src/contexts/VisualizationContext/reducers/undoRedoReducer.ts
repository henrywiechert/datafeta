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
        manualColor: action.payload.manualColor ?? state.manualColor,
        sizeField: action.payload.sizeField,
        sizeRange: action.payload.sizeRange,
        manualSize: action.payload.manualSize,
        bandThicknessScale: action.payload.bandThicknessScale ?? state.bandThicknessScale,
        independentDomains: action.payload.independentDomains ?? state.independentDomains,
        fieldOverrides: action.payload.fieldOverrides || {},
        globalChartType: action.payload.globalChartType ?? null,
        distributionVariant: action.payload.distributionVariant ?? state.distributionVariant,
        boxPlotReferenceLineMode: action.payload.boxPlotReferenceLineMode ?? state.boxPlotReferenceLineMode,
        axisLabelStyles: action.payload.axisLabelStyles ?? state.axisLabelStyles,
        facetLabelStyles: action.payload.facetLabelStyles ?? state.facetLabelStyles,
        facetBackgroundField: action.payload.facetBackgroundField ?? state.facetBackgroundField,
        facetBackgroundScheme: action.payload.facetBackgroundScheme ?? state.facetBackgroundScheme,
        facetBackgroundOpacity: action.payload.facetBackgroundOpacity ?? state.facetBackgroundOpacity,
        showTableRows: action.payload.showTableRows ?? state.showTableRows,
        overlays: action.payload.overlays ?? state.overlays,
        shapeField: action.payload.shapeField !== undefined ? action.payload.shapeField : state.shapeField,
        manualShape: action.payload.manualShape ?? state.manualShape,
        queryVersion: state.queryVersion + 1,
      };
    default:
      return null; // Not handled by this reducer
  }
}

