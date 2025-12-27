import { VisualizationState, VisualizationAction } from '../types';
import { sameFieldArray } from './utils';

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
    case 'SET_MANUAL_COLOR':
      return { ...state, manualColor: action.payload };
    case 'REMOVE_COLOR_FIELD': {
      if (!state.colorField) return state;
      return { ...state, colorField: null, queryVersion: state.queryVersion + 1 };
    }
    
    // Size encoding
    case 'SET_SIZE_FIELD':
      // Same rationale as SET_COLOR_FIELD: allow updates for same-id fields when properties change.
      if (state.sizeField === action.payload) return state;
      return { ...state, sizeField: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_SIZE_RANGE':
      return { ...state, sizeRange: action.payload };
    case 'SET_MANUAL_SIZE':
      return { ...state, manualSize: action.payload };
    case 'REMOVE_SIZE_FIELD':
      if (!state.sizeField) return state;
      return { ...state, sizeField: null, queryVersion: state.queryVersion + 1 };
    
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
    
    // MeasureNames/MeasureValues source tracking
    case 'SET_MEASURE_VALUES_SOURCE_FIELDS': {
      if (sameFieldArray(state.measureValuesSourceFields, action.payload)) return state;
      return { ...state, measureValuesSourceFields: action.payload };
    }
    
    default:
      return null; // Not handled by this reducer
  }
}

