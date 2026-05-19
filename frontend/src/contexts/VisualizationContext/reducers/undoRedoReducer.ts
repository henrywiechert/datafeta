// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
        labelFields: action.payload.labelFields ?? state.labelFields,
        labelsEnabled: action.payload.labelsEnabled ?? state.labelsEnabled,
        labelSamplingStrategy: action.payload.labelSamplingStrategy ?? state.labelSamplingStrategy,
        labelSamplingThreshold: action.payload.labelSamplingThreshold ?? state.labelSamplingThreshold,
        labelSampleEvery: action.payload.labelSampleEvery ?? state.labelSampleEvery,
        bandThicknessScale: action.payload.bandThicknessScale ?? state.bandThicknessScale,
        independentDomains: action.payload.independentDomains ?? state.independentDomains,
        fieldOverrides: action.payload.fieldOverrides || {},
        globalChartType: action.payload.globalChartType ?? null,
        lineVariant: action.payload.lineVariant ?? state.lineVariant,
        areaFillOpacity: action.payload.areaFillOpacity ?? state.areaFillOpacity,
        distributionVariant: action.payload.distributionVariant ?? state.distributionVariant,
        tableCellMode: action.payload.tableCellMode ?? state.tableCellMode,
        tablePage: action.payload.tablePage ?? state.tablePage,
        labelFontSize: action.payload.labelFontSize ?? state.labelFontSize,
        axisLabelStyles: action.payload.axisLabelStyles ?? state.axisLabelStyles,
        categoryTickStyles: action.payload.categoryTickStyles ?? state.categoryTickStyles,
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

