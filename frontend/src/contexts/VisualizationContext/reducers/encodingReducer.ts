// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { VisualizationState, VisualizationAction } from '../types';
import { sameFieldArray } from './utils';

function updateArrayEntry<T>(
  values: T[] | undefined,
  index: number,
  nextValue: T,
): T[] | null {
  if (!Number.isInteger(index) || index < 0) return null;

  const currentValues = values ?? [];
  if (currentValues[index] === nextValue) return currentValues;

  const nextValues = [...currentValues];
  nextValues[index] = nextValue;
  return nextValues;
}

/**
 * Handles visual encoding actions: color, size, labels, and tooltips.
 */
export function encodingReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    // Color encoding
    case 'SET_COLOR_FIELD': {
      // Important: don't short-circuit on id equality.
      // We often update the same field instance (same id) via context-menu edits (type/flavour/agg/etc.).
      if (state.colorField === action.payload) return state;
      return { ...state, colorField: action.payload, queryVersion: state.queryVersion + 1 };
    }
    case 'SET_COLOR_SCHEME':
      return { ...state, colorScheme: action.payload };
    case 'SET_COLOR_BIAS':
      return { ...state, colorBias: action.payload };
    case 'SET_COLOR_REVERSED':
      return { ...state, colorReversed: action.payload };
    case 'SET_MANUAL_COLOR':
      return { ...state, manualColor: action.payload };
    case 'REMOVE_COLOR_FIELD': {
      if (!state.colorField) return state;
      return { ...state, colorField: null, queryVersion: state.queryVersion + 1 };
    }
    
    // Facet background encoding
    case 'SET_FACET_BACKGROUND_FIELD':
      // Allow updates for same-id fields when properties change (same rationale as color/size)
      if (state.facetBackgroundField === action.payload) return state;
      // Increment queryVersion to trigger a new query with this field included
      return { ...state, facetBackgroundField: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_FACET_BACKGROUND_SCHEME':
      return { ...state, facetBackgroundScheme: action.payload };
    case 'SET_FACET_BACKGROUND_OPACITY':
      return { ...state, facetBackgroundOpacity: action.payload };
    case 'REMOVE_FACET_BACKGROUND_FIELD':
      if (!state.facetBackgroundField) return state;
      // Increment queryVersion since we may no longer need this field in the query
      return { ...state, facetBackgroundField: null, queryVersion: state.queryVersion + 1 };
    
    // Size encoding
    case 'SET_SIZE_FIELD':
      // Same rationale as SET_COLOR_FIELD: allow updates for same-id fields when properties change.
      if (state.sizeField === action.payload) return state;
      return { ...state, sizeField: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_SIZE_RANGE':
      return { ...state, sizeRange: action.payload };
    case 'SET_MANUAL_SIZE':
      return { ...state, manualSize: action.payload };
    case 'SET_BAND_THICKNESS_SCALE':
      return { ...state, bandThicknessScale: action.payload };
    case 'REMOVE_SIZE_FIELD':
      if (!state.sizeField) return state;
      return { ...state, sizeField: null, queryVersion: state.queryVersion + 1 };
    
    // Shape encoding (scatter only, discrete only)
    case 'SET_SHAPE_FIELD':
      if (state.shapeField === action.payload) return state;
      return { ...state, shapeField: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_MANUAL_SHAPE':
      return { ...state, manualShape: action.payload };
    case 'REMOVE_SHAPE_FIELD':
      if (!state.shapeField) return state;
      return { ...state, shapeField: null, queryVersion: state.queryVersion + 1 };
    
    // Label encoding
    case 'SET_LABEL_FIELDS': {
      if (sameFieldArray(state.labelFields, action.payload)) return state;
      return { 
        ...state, 
        labelFields: action.payload, 
        labelsEnabled: action.payload.length > 0 || state.labelsEnabled, 
        queryVersion: state.queryVersion + 1 
      };
    }
    case 'ADD_LABEL_FIELD': {
      if (state.labelFields.some(f => f.columnName === action.payload.columnName)) return state;
      const newFields = [...state.labelFields, action.payload];
      return { ...state, labelFields: newFields, labelsEnabled: true, queryVersion: state.queryVersion + 1 };
    }
    case 'REMOVE_LABEL_FIELD': {
      const newFields = state.labelFields.filter(f => f.id !== action.payload && f.columnName !== action.payload);
      if (newFields.length === state.labelFields.length) return state;
      return { 
        ...state, 
        labelFields: newFields, 
        labelsEnabled: newFields.length > 0 && state.labelsEnabled, 
        queryVersion: state.queryVersion + 1 
      };
    }
    case 'SET_LABELS_ENABLED':
      return { ...state, labelsEnabled: action.payload };
    case 'SET_LABEL_SAMPLING_STRATEGY':
      return { ...state, labelSamplingStrategy: action.payload };
    case 'SET_LABEL_SAMPLING_THRESHOLD':
      return { ...state, labelSamplingThreshold: action.payload };
    case 'SET_LABEL_SAMPLE_EVERY':
      return { ...state, labelSampleEvery: Math.max(1, action.payload) };
    case 'SET_LABEL_FONT_SIZE':
      return { ...state, labelFontSize: Math.max(8, Math.min(26, action.payload)) };
    
    // Tooltip encoding
    case 'SET_TOOLTIP_FIELDS': {
      if (sameFieldArray(state.tooltipFields, action.payload)) return state;
      return { ...state, tooltipFields: action.payload, queryVersion: state.queryVersion + 1 };
    }
    case 'ADD_TOOLTIP_FIELD': {
      if (state.tooltipFields.some(f => f.columnName === action.payload.columnName)) return state;
      const newFields = [...state.tooltipFields, action.payload];
      return { ...state, tooltipFields: newFields, queryVersion: state.queryVersion + 1 };
    }
    case 'REMOVE_TOOLTIP_FIELD': {
      const newFields = state.tooltipFields.filter(f => f.id !== action.payload && f.columnName !== action.payload);
      if (newFields.length === state.tooltipFields.length) return state;
      return { ...state, tooltipFields: newFields, queryVersion: state.queryVersion + 1 };
    }
    
    // Table view columns (raw-rows table). Separate query hook reacts to this
    // list directly, so no queryVersion bump is needed.
    case 'SET_TABLE_COLUMN_FIELDS': {
      if (sameFieldArray(state.tableColumnFields, action.payload)) return state;
      return { ...state, tableColumnFields: action.payload };
    }

    // MeasureNames/MeasureValues source tracking
    case 'SET_MEASURE_VALUES_SOURCE_FIELDS': {
      if (sameFieldArray(state.measureValuesSourceFields, action.payload)) return state;
      return { ...state, measureValuesSourceFields: action.payload };
    }
    
    // Axis label styling
    case 'SET_X_AXIS_LABEL_STYLE':
      return {
        ...state,
        axisLabelStyles: {
          ...state.axisLabelStyles,
          xAxis: { ...state.axisLabelStyles.xAxis, ...action.payload },
        },
      };
    case 'SET_Y_AXIS_LABEL_STYLE':
      return {
        ...state,
        axisLabelStyles: {
          ...state.axisLabelStyles,
          yAxis: { ...state.axisLabelStyles.yAxis, ...action.payload },
        },
      };
    
    // Category tick styling
    case 'SET_CATEGORY_X_HEIGHT_PX':
      if (state.categoryTickStyles.xHeightPx === action.payload) return state;
      return {
        ...state,
        categoryTickStyles: {
          ...state.categoryTickStyles,
          xHeightPx: action.payload,
        }
      };
    case 'SET_CATEGORY_Y_WIDTH_PX':
      if (state.categoryTickStyles.yWidthPx === action.payload) return state;
      return {
        ...state,
        categoryTickStyles: {
          ...state.categoryTickStyles,
          yWidthPx: action.payload,
        }
      };

    // Facet label styling
    case 'SET_FACET_TOP_HEADER_STYLE':
      return {
        ...state,
        facetLabelStyles: {
          ...state.facetLabelStyles,
          topHeader: { ...state.facetLabelStyles.topHeader, ...action.payload },
        },
      };
    case 'SET_FACET_TOP_VALUES_STYLE':
      return {
        ...state,
        facetLabelStyles: {
          ...state.facetLabelStyles,
          topValues: { ...state.facetLabelStyles.topValues, ...action.payload },
        },
      };
    case 'SET_FACET_TOP_VALUES_DEPTH_HEIGHT': {
      const nextHeights = updateArrayEntry(
        state.facetLabelStyles.topValues.heightPxByDepth,
        action.payload.depthIndex,
        action.payload.heightPx,
      );
      if (nextHeights === null) return state;
      if (nextHeights === state.facetLabelStyles.topValues.heightPxByDepth) return state;
      return {
        ...state,
        facetLabelStyles: {
          ...state.facetLabelStyles,
          topValues: {
            ...state.facetLabelStyles.topValues,
            heightPxByDepth: nextHeights,
          },
        },
      };
    }
    case 'SET_FACET_LEFT_HEADER_STYLE':
      return {
        ...state,
        facetLabelStyles: {
          ...state.facetLabelStyles,
          leftHeader: { ...state.facetLabelStyles.leftHeader, ...action.payload },
        },
      };
    case 'SET_FACET_LEFT_VALUES_STYLE':
      return {
        ...state,
        facetLabelStyles: {
          ...state.facetLabelStyles,
          leftValues: { ...state.facetLabelStyles.leftValues, ...action.payload },
        },
      };
    case 'SET_FACET_LEFT_VALUES_DEPTH_WIDTH': {
      const nextWidths = updateArrayEntry(
        state.facetLabelStyles.leftValues.widthPxByDepth,
        action.payload.depthIndex,
        action.payload.widthPx,
      );
      if (nextWidths === null) return state;
      if (nextWidths === state.facetLabelStyles.leftValues.widthPxByDepth) return state;
      return {
        ...state,
        facetLabelStyles: {
          ...state.facetLabelStyles,
          leftValues: {
            ...state.facetLabelStyles.leftValues,
            widthPxByDepth: nextWidths,
          },
        },
      };
    }
    case 'SET_MEASURE_BAND_COL_WIDTH': {
      const current = state.facetLabelStyles.measureBands ?? {};
      const nextWidths = updateArrayEntry(
        current.colWidthsPx,
        action.payload.bandIndex,
        action.payload.widthPx,
      );
      if (nextWidths === null) return state;
      if (nextWidths === current.colWidthsPx) return state;
      return {
        ...state,
        facetLabelStyles: {
          ...state.facetLabelStyles,
          measureBands: { ...current, colWidthsPx: nextWidths },
        },
      };
    }
    case 'SET_MEASURE_BAND_ROW_HEIGHT': {
      const current = state.facetLabelStyles.measureBands ?? {};
      const nextHeights = updateArrayEntry(
        current.rowHeightsPx,
        action.payload.bandIndex,
        action.payload.heightPx,
      );
      if (nextHeights === null) return state;
      if (nextHeights === current.rowHeightsPx) return state;
      return {
        ...state,
        facetLabelStyles: {
          ...state.facetLabelStyles,
          measureBands: { ...current, rowHeightsPx: nextHeights },
        },
      };
    }
    
    default:
      return null; // Not handled by this reducer
  }
}

