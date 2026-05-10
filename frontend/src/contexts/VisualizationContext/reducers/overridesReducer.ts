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
    case 'SET_SHOW_TABLE_ROWS':
      return { ...state, showTableRows: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_GLOBAL_CHART_TYPE': {
      const prev = state.globalChartType;
      const next = action.payload;
      const cdfChanged = (prev === 'cdf') !== (next === 'cdf');
      const pieChanged = (prev === 'pie') !== (next === 'pie');
      return {
        ...state,
        globalChartType: next,
        queryVersion: cdfChanged || pieChanged ? state.queryVersion + 1 : state.queryVersion,
      };
    }
    case 'SET_DISTRIBUTION_VARIANT': {
      const variantChanged = state.distributionVariant !== action.payload;
      return {
        ...state,
        distributionVariant: action.payload,
        queryVersion: variantChanged ? state.queryVersion + 1 : state.queryVersion,
      };
    }
    case 'SET_TABLE_CELL_MODE': {
      // Pure rendering toggle: no query refetch needed, so leave queryVersion alone.
      return {
        ...state,
        tableCellMode: action.payload,
      };
    }
    case 'SET_TABLE_PAGE': {
      // Pager navigation does not bump queryVersion; the chart pipeline reacts to
      // the changed page index via cache key + generator slicing.
      const next = Math.max(0, Math.floor(action.payload));
      if (next === state.tablePage) return state;
      return {
        ...state,
        tablePage: next,
      };
    }
    // --- Overlay actions (visual-only, no query version bump) ---
    case 'SET_OVERLAYS':
      return { ...state, overlays: action.payload };
    case 'TOGGLE_OVERLAY':
      return {
        ...state,
        overlays: (state.overlays || []).map(o =>
          o.type === action.payload.type ? { ...o, enabled: action.payload.enabled } : o
        ),
      };
    case 'UPDATE_OVERLAY_PARAMS':
      return {
        ...state,
        overlays: (state.overlays || []).map(o =>
          o.type === action.payload.type
            ? { ...o, params: { ...o.params, ...action.payload.params } }
            : o
        ),
      };
    case 'UPDATE_OVERLAY':
      return {
        ...state,
        overlays: (state.overlays || []).map(o =>
          o.type === action.payload.type ? { ...o, ...action.payload.config } : o
        ),
      };
    default:
      return null; // Not handled by this reducer
  }
}

