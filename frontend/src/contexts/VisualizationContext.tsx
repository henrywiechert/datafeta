import React, { createContext, useContext, useReducer, ReactNode, useRef, useCallback } from 'react';
import { Field, Database, Table, QueryResult, FilterConfig, FilterMetadata, VirtualColumnDefinition, FieldOverrideState } from '../types';
import { getTimeoutForOperation } from '../config/loadingConfig';

// Define loading operation types
export type LoadingOperationType = 'query' | 'rendering' | 'metadata';

// Define the state interface
interface VisualizationState {
  xAxisFields: Field[];
  yAxisFields: Field[];
  availableFields: Field[];
  databases: Database[];
  tables: Table[];
  selectedDatabase: string;
  selectedTable: string;
  isLoadingMetadata: boolean;
  metadataError: string | null;
  queryResult: QueryResult | null;
  queryError: string | null;
  // New loading states
  isLoadingQuery: boolean;
  isLoadingRendering: boolean;
  showLoadingModal: boolean;
  loadingOperationType: LoadingOperationType | null;
  loadingStartTime: number | null;
  canCancelOperation: boolean;
  // Filter states
  filterFields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  filterMetadata: Record<string, FilterMetadata>;
  appliedFilterConfigurations: Record<string, FilterConfig>; // Actually applied filters
  // Color encoding state
  colorField: Field | null;
  colorScheme: string;
  colorBias: number; // -1 (left bias) to 1 (right bias), 0 = centered
  manualColor: string; // Used when no color field is present
  // Size encoding state
  sizeField: Field | null;
  sizeRange: [number, number]; // Min and max size
  manualSize: number; // Used when no field is present
  // Label configuration state
  labelFields: Field[]; // Fields whose values will be shown as labels (order not significant)
  labelsEnabled: boolean; // Whether labels are enabled (auto true if labelFields non-empty)
  labelSamplingStrategy: 'auto' | 'all' | 'sample';
  labelSamplingThreshold: number; // threshold for auto strategy (e.g., 300)
  labelSampleEvery: number; // nth point when strategy = sample (computed or user adjustable later)
  // Tooltip configuration state
  tooltipFields: Field[]; // Fields whose values will be shown in tooltips only (do not affect chart visualization)
  // --- Per-operation timing (phase 1 introduction) ---
  operationStartTimes: Record<LoadingOperationType, number | null>; // individual start times
  activeOperations: LoadingOperationType[]; // active operations list
  modalPrimaryOperation: LoadingOperationType | null; // chosen operation for modal display
  // Virtual columns (calculated columns)
  virtualColumns: VirtualColumnDefinition[];
  // Virtual column field preferences (stores type, flavour, aggregation for virtual columns in available fields)
  virtualColumnFieldPreferences: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>;
  // Per-field chart overrides
  fieldOverrides: Record<string, FieldOverrideState>;
  queryVersion: number; // increments only when query semantics change
}

// Define action types
type VisualizationAction =
  | { type: 'SET_X_AXIS_FIELDS'; payload: Field[] }
  | { type: 'SET_Y_AXIS_FIELDS'; payload: Field[] }
  | { type: 'SWAP_AXIS_FIELDS' }
  | { type: 'MOVE_FIELD_BETWEEN_AXES'; payload: { fieldId: string; fromAxis: 'x' | 'y'; toAxis: 'x' | 'y'; insertIndex?: number } }
  | { type: 'SET_AVAILABLE_FIELDS'; payload: Field[] }
  | { type: 'SET_DATABASES'; payload: Database[] }
  | { type: 'SET_TABLES'; payload: Table[] }
  | { type: 'SET_SELECTED_DATABASE'; payload: string }
  | { type: 'SET_SELECTED_TABLE'; payload: string }
  | { type: 'SET_LOADING_METADATA'; payload: boolean }
  | { type: 'SET_METADATA_ERROR'; payload: string | null }
  | { type: 'UPDATE_FIELD'; payload: Field }
  | { type: 'SET_QUERY_RESULT'; payload: QueryResult | null }
  | { type: 'SET_QUERY_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' }
  // New action types
  | { type: 'SET_LOADING_QUERY'; payload: boolean }
  | { type: 'SET_LOADING_RENDERING'; payload: boolean }
  | { type: 'SET_LOADING_MODAL'; payload: { show: boolean; operationType?: LoadingOperationType; canCancel?: boolean } }
  | { type: 'SET_LOADING_START_TIME'; payload: number | null }
  | { type: 'CANCEL_OPERATION' }
  | { type: 'COMPLETE_SPECIFIC_OPERATION'; payload: LoadingOperationType; }
  | { type: 'RESET_LOADING_STATES' }
  | { type: 'SET_OPERATION_START_TIME'; payload: { op: LoadingOperationType; time: number } }
  | { type: 'ADD_ACTIVE_OPERATION'; payload: LoadingOperationType }
  | { type: 'REMOVE_ACTIVE_OPERATION'; payload: LoadingOperationType }
  | { type: 'SET_MODAL_PRIMARY_OPERATION'; payload: LoadingOperationType | null }
  | { type: 'ENSURE_PRIMARY_OPERATION'; payload: LoadingOperationType }
  // REQUEST_SHOW_MODAL introduces a guarded path for revealing the modal after timeout.
  // It validates that the target operation is still active to prevent showing a stale dialog
  // when the operation already completed before the timeout fired.
  | { type: 'REQUEST_SHOW_MODAL'; payload: { operationType: LoadingOperationType; canCancel: boolean } }
  // Filter action types
  | { type: 'SET_FILTER_FIELDS'; payload: Field[] }
  | { type: 'SET_FILTER_CONFIGURATION'; payload: { fieldId: string; config: FilterConfig } }
  | { type: 'SET_FILTER_METADATA'; payload: { fieldId: string; metadata: FilterMetadata } }
  | { type: 'REMOVE_FILTER_CONFIGURATION'; payload: string }
  | { type: 'APPLY_FILTERS' }
  // Color encoding action types
  | { type: 'SET_COLOR_FIELD'; payload: Field | null }
  | { type: 'SET_COLOR_SCHEME'; payload: string }
  | { type: 'SET_COLOR_BIAS'; payload: number }
  | { type: 'SET_MANUAL_COLOR'; payload: string }
  | { type: 'REMOVE_COLOR_FIELD' }
  // Size encoding action types
  | { type: 'SET_SIZE_FIELD'; payload: Field | null }
  | { type: 'SET_SIZE_RANGE'; payload: [number, number] }
  | { type: 'SET_MANUAL_SIZE'; payload: number }
  | { type: 'REMOVE_SIZE_FIELD' }
  // Label actions
  | { type: 'SET_LABEL_FIELDS'; payload: Field[] }
  | { type: 'ADD_LABEL_FIELD'; payload: Field }
  | { type: 'REMOVE_LABEL_FIELD'; payload: string }
  | { type: 'SET_LABELS_ENABLED'; payload: boolean }
  | { type: 'SET_LABEL_SAMPLING_STRATEGY'; payload: 'auto' | 'all' | 'sample' }
  | { type: 'SET_LABEL_SAMPLING_THRESHOLD'; payload: number }
  | { type: 'SET_LABEL_SAMPLE_EVERY'; payload: number }
  // Tooltip actions
  | { type: 'SET_TOOLTIP_FIELDS'; payload: Field[] }
  | { type: 'ADD_TOOLTIP_FIELD'; payload: Field }
  | { type: 'REMOVE_TOOLTIP_FIELD'; payload: string }
  // Virtual column action types
  | { type: 'SET_VIRTUAL_COLUMNS'; payload: VirtualColumnDefinition[] }
  | { type: 'ADD_VIRTUAL_COLUMN'; payload: VirtualColumnDefinition }
  | { type: 'UPDATE_VIRTUAL_COLUMN'; payload: { index: number; column: VirtualColumnDefinition } }
  | { type: 'REMOVE_VIRTUAL_COLUMN'; payload: number }
  | { type: 'UPDATE_VIRTUAL_COLUMN_FIELD_PREFERENCE'; payload: { columnName: string; preference: { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string } } }
  // Per-field chart override actions
  | { type: 'SET_FIELD_OVERRIDES'; payload: Record<string, FieldOverrideState> }
  | { type: 'UPDATE_FIELD_OVERRIDE'; payload: { fieldId: string; override: Partial<FieldOverrideState> } }
  | { type: 'CLEAR_FIELD_OVERRIDE'; payload: { fieldId: string } }
  // Undo/Redo actions
  | { type: 'RESTORE_UNDOABLE_STATE'; payload: {
      xAxisFields: Field[];
      yAxisFields: Field[];
      filterFields: Field[];
      filterConfigurations: Record<string, FilterConfig>;
      appliedFilterConfigurations: Record<string, FilterConfig>;
      colorField: Field | null;
      colorScheme: string;
      colorBias: number;
      sizeField: Field | null;
      sizeRange: [number, number];
      manualSize: number;
      virtualColumns: VirtualColumnDefinition[];
      virtualColumnFieldPreferences: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>;
      fieldOverrides: Record<string, FieldOverrideState>;
    } }
  // Multi-table actions (joins/unions)
  | { type: 'TABLE_JOINS_UNIONS_MODIFIED' };

// Initial state
const initialState: VisualizationState = {
  xAxisFields: [],
  yAxisFields: [],
  availableFields: [],
  databases: [],
  tables: [],
  selectedDatabase: '',
  selectedTable: '',
  isLoadingMetadata: false,
  metadataError: null,
  queryResult: null,
  queryError: null,
  // New loading states
  isLoadingQuery: false,
  isLoadingRendering: false,
  showLoadingModal: false,
  loadingOperationType: null,
  loadingStartTime: null,
  canCancelOperation: false,
  // Filter states
  filterFields: [],
  filterConfigurations: {},
  filterMetadata: {},
  appliedFilterConfigurations: {},
  // Color encoding state
  colorField: null,
  colorScheme: 'tableau10',
  colorBias: 0, // Default: centered gradient
  manualColor: '#1976d2', // Default brand blue
  // Size encoding state
  sizeField: null,
  sizeRange: [4, 20], // Default range for sizes
  manualSize: 10, // Default manual size
  // Label configuration defaults
  labelFields: [],
  labelsEnabled: false,
  labelSamplingStrategy: 'auto',
  labelSamplingThreshold: 300,
  labelSampleEvery: 1,
  // Tooltip configuration defaults
  tooltipFields: [],
  // Per-operation timing defaults
  operationStartTimes: { query: null, rendering: null, metadata: null },
  activeOperations: [],
  modalPrimaryOperation: null,
  // Virtual columns defaults
  virtualColumns: [],
  virtualColumnFieldPreferences: {},
  // Per-field overrides default
  fieldOverrides: {},
  queryVersion: 0,
};

// Helper: shallow compare field id arrays (order significant where provided)
function sameFieldArray(a: Field[], b: Field[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

// Reducer function
function visualizationReducer(state: VisualizationState, action: VisualizationAction): VisualizationState {
  switch (action.type) {
    case 'SET_X_AXIS_FIELDS':
      if (sameFieldArray(state.xAxisFields, action.payload)) return state; // no semantic change
      return { ...state, xAxisFields: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_Y_AXIS_FIELDS':
      if (sameFieldArray(state.yAxisFields, action.payload)) return state;
      return { ...state, yAxisFields: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SWAP_AXIS_FIELDS':
      // Swap X and Y axis fields - no query needed, just rearranging existing fields
      return { 
        ...state, 
        xAxisFields: state.yAxisFields, 
        yAxisFields: state.xAxisFields
      };
    case 'MOVE_FIELD_BETWEEN_AXES': {
      // Atomically move a field from one axis to another
      const { fieldId, fromAxis, toAxis, insertIndex } = action.payload;
      const sourceFields = fromAxis === 'x' ? state.xAxisFields : state.yAxisFields;
      const targetFields = toAxis === 'x' ? state.xAxisFields : state.yAxisFields;
      
      // Find and remove the field from source axis
      const fieldToMove = sourceFields.find(f => f.id === fieldId);
      if (!fieldToMove) {
        return state; // Field not found
      }
      
      // Check if field already in target position (prevent redundant moves in Strict Mode)
      const fieldAlreadyInTarget = targetFields.some(f => f.id === fieldId);
      if (fieldAlreadyInTarget) {
        return state;
      }
      
      const newSourceFields = sourceFields.filter(f => f.id !== fieldId);
      
      // Add to target axis at specified index
      const newTargetFields = [...targetFields];
      if (insertIndex !== undefined) {
        newTargetFields.splice(insertIndex, 0, fieldToMove);
      } else {
        newTargetFields.push(fieldToMove);
      }
      
      // Update both axes in a single state change
      // NOTE: Don't increment queryVersion - we're just rearranging existing fields
      return {
        ...state,
        xAxisFields: fromAxis === 'x' ? newSourceFields : toAxis === 'x' ? newTargetFields : state.xAxisFields,
        yAxisFields: fromAxis === 'y' ? newSourceFields : toAxis === 'y' ? newTargetFields : state.yAxisFields
      };
    }
    case 'SET_AVAILABLE_FIELDS':
      return { ...state, availableFields: action.payload };
    case 'SET_DATABASES':
      return { ...state, databases: action.payload };
    case 'SET_TABLES':
      return { ...state, tables: action.payload };
    case 'SET_SELECTED_DATABASE':
      if (state.selectedDatabase === action.payload) return state;
      return { ...state, selectedDatabase: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_SELECTED_TABLE':
      if (state.selectedTable === action.payload) return state;
      return { ...state, selectedTable: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_LOADING_METADATA':
      return { ...state, isLoadingMetadata: action.payload };
    case 'SET_METADATA_ERROR':
      return { ...state, metadataError: action.payload };
    case 'UPDATE_FIELD': {
      // Only update arrays that actually contain the field id.
      // This preserves reference equality for x/y axis field arrays when
      // editing fields in the available list (left panel), avoiding chart re-renders.
      const updated = action.payload;

      let xChanged = false;
      const newX = state.xAxisFields.map((f) => {
        if (f.id === updated.id) {
          xChanged = true;
          return updated;
        }
        return f;
      });

      let yChanged = false;
      const newY = state.yAxisFields.map((f) => {
        if (f.id === updated.id) {
          yChanged = true;
          return updated;
        }
        return f;
      });

      let availChanged = false;
      const newAvail = state.availableFields.map((f) => {
        if (f.id === updated.id) {
          availChanged = true;
          return updated;
        }
        return f;
      });

      const bumped = xChanged || yChanged || (state.colorField && state.colorField.id === updated.id) || (state.sizeField && state.sizeField.id === updated.id) || state.labelFields.some(f => f.id === updated.id);
      return {
        ...state,
        xAxisFields: xChanged ? newX : state.xAxisFields,
        yAxisFields: yChanged ? newY : state.yAxisFields,
        availableFields: availChanged ? newAvail : state.availableFields,
        queryVersion: bumped ? state.queryVersion + 1 : state.queryVersion,
      };
    }
    case 'SET_QUERY_RESULT':
      return { ...state, queryResult: action.payload, queryError: null };
    case 'SET_QUERY_ERROR':
      return { ...state, queryResult: null, queryError: action.payload };
    case 'SET_LOADING_QUERY':
      return { ...state, isLoadingQuery: action.payload };
    case 'SET_LOADING_RENDERING':
      return { ...state, isLoadingRendering: action.payload };
    case 'SET_LOADING_MODAL':
      return { 
        ...state, 
        showLoadingModal: action.payload.show,
        loadingOperationType: action.payload.operationType || state.loadingOperationType,
        canCancelOperation: action.payload.canCancel !== undefined ? action.payload.canCancel : state.canCancelOperation
      };
    case 'SET_LOADING_START_TIME':
      return { ...state, loadingStartTime: action.payload };
    case 'SET_OPERATION_START_TIME':
      return { ...state, operationStartTimes: { ...state.operationStartTimes, [action.payload.op]: action.payload.time } };
    case 'ADD_ACTIVE_OPERATION': {
      if (state.activeOperations.includes(action.payload)) return state;
      return { ...state, activeOperations: [...state.activeOperations, action.payload] };
    }
    case 'REMOVE_ACTIVE_OPERATION':
      return { ...state, activeOperations: state.activeOperations.filter(o => o !== action.payload) };
    case 'SET_MODAL_PRIMARY_OPERATION':
      return { ...state, modalPrimaryOperation: action.payload };
    case 'ENSURE_PRIMARY_OPERATION': {
      // Only set a primary if none exists AND the operation is still active.
      if (state.modalPrimaryOperation) return state;
      if (!state.activeOperations.includes(action.payload)) return state; // operation already completed
      return { ...state, modalPrimaryOperation: action.payload };
    }
    case 'REQUEST_SHOW_MODAL': {
      // Guard against race: if operation finished before timeout fired, ignore showing modal.
      if (!state.activeOperations.includes(action.payload.operationType)) {
        return state; // stale timeout
      }
      return {
        ...state,
        showLoadingModal: true,
        loadingOperationType: action.payload.operationType,
        canCancelOperation: action.payload.canCancel
      };
    }
    case 'CANCEL_OPERATION':
      return {
        ...state,
        isLoadingQuery: false,
        isLoadingRendering: false,
        isLoadingMetadata: false,
        showLoadingModal: false,
        loadingOperationType: null,
        loadingStartTime: null,
        canCancelOperation: false,
        operationStartTimes: { query: null, rendering: null, metadata: null },
        activeOperations: [],
        modalPrimaryOperation: null,
      };
    case 'COMPLETE_SPECIFIC_OPERATION':
      {
        let updatedState = { ...state };
        switch (action.payload) {
          case 'query':
            updatedState.isLoadingQuery = false;
            break;
          case 'rendering':
            updatedState.isLoadingRendering = false;
            break;
          case 'metadata':
            updatedState.isLoadingMetadata = false;
            break;
        }
        // Clear start time for this operation
        if (updatedState.operationStartTimes[action.payload] != null) {
          updatedState.operationStartTimes = { ...updatedState.operationStartTimes, [action.payload]: null };
        }
        // Remove from activeOperations if present (defensive; already removed earlier in completeOperation)
        if (updatedState.activeOperations.includes(action.payload)) {
          updatedState.activeOperations = updatedState.activeOperations.filter(o => o !== action.payload);
        }
        // Recompute primary if necessary
        if (updatedState.modalPrimaryOperation === action.payload) {
          const remaining = updatedState.activeOperations;
          if (remaining.length === 0) {
            updatedState.modalPrimaryOperation = null;
          } else {
            // Choose earliest start (longest-running)
            const longest = remaining.reduce((acc, op) => {
              const t = updatedState.operationStartTimes[op] || Infinity;
              const accT = updatedState.operationStartTimes[acc] || Infinity;
              return t < accT ? op : acc;
            }, remaining[0]);
            updatedState.modalPrimaryOperation = longest;
          }
        }
        // If modal is open but primary is null (edge race), attempt to assign one.
        if (updatedState.showLoadingModal && !updatedState.modalPrimaryOperation && updatedState.activeOperations.length > 0) {
          const longest = updatedState.activeOperations.reduce((acc, op) => {
            const t = updatedState.operationStartTimes[op] || Infinity;
            const accT = updatedState.operationStartTimes[acc] || Infinity;
            return t < accT ? op : acc;
          }, updatedState.activeOperations[0]);
          updatedState.modalPrimaryOperation = longest;
        }
        // Only hide modal if all operations are complete
        if (!updatedState.isLoadingQuery && !updatedState.isLoadingRendering && !updatedState.isLoadingMetadata) {
          updatedState.showLoadingModal = false;
          updatedState.loadingOperationType = null;
          updatedState.loadingStartTime = null;
          updatedState.canCancelOperation = false;
          updatedState.modalPrimaryOperation = null;
        }
        return updatedState;
      }
    case 'RESET_LOADING_STATES':
      return {
        ...state,
        isLoadingQuery: false,
        isLoadingRendering: false,
        showLoadingModal: false,
        loadingOperationType: null,
        loadingStartTime: null,
        canCancelOperation: false,
        operationStartTimes: { query: null, rendering: null, metadata: null },
        activeOperations: [],
        modalPrimaryOperation: null,
      };
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
    case 'REMOVE_FILTER_CONFIGURATION':
      {
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
          queryVersion: state.queryVersion + 1,
      };
    }
    case 'APPLY_FILTERS':
      return {
        ...state,
        appliedFilterConfigurations: { ...state.filterConfigurations },
        queryVersion: state.queryVersion + 1,
      };
    case 'SET_COLOR_FIELD': {
      if (state.colorField?.id === action.payload?.id) return state;
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
    case 'SET_SIZE_FIELD':
      if (state.sizeField?.id === action.payload?.id) return state;
      return { ...state, sizeField: action.payload, queryVersion: state.queryVersion + 1 };
    case 'SET_SIZE_RANGE':
      // Purely visual; should not alter query semantics
      return { ...state, sizeRange: action.payload };
    case 'SET_MANUAL_SIZE':
      // Purely visual; should not alter query semantics
      return { ...state, manualSize: action.payload };
    case 'REMOVE_SIZE_FIELD':
      if (!state.sizeField) return state;
      return { ...state, sizeField: null, queryVersion: state.queryVersion + 1 };
    // Label reducers
    case 'SET_LABEL_FIELDS': {
      if (sameFieldArray(state.labelFields, action.payload)) return state;
      return { ...state, labelFields: action.payload, labelsEnabled: action.payload.length > 0 || state.labelsEnabled, queryVersion: state.queryVersion + 1 };
    }
    case 'ADD_LABEL_FIELD': {
      if (state.labelFields.some(f => f.columnName === action.payload.columnName)) return state; // no change
      const newFields = [...state.labelFields, action.payload];
      return { ...state, labelFields: newFields, labelsEnabled: true, queryVersion: state.queryVersion + 1 };
    }
    case 'REMOVE_LABEL_FIELD': {
      const newFields = state.labelFields.filter(f => f.id !== action.payload && f.columnName !== action.payload);
      if (newFields.length === state.labelFields.length) return state; // nothing removed
      return { ...state, labelFields: newFields, labelsEnabled: newFields.length > 0 && state.labelsEnabled, queryVersion: state.queryVersion + 1 };
    }
    case 'SET_LABELS_ENABLED':
      return { ...state, labelsEnabled: action.payload };
    case 'SET_LABEL_SAMPLING_STRATEGY':
      return { ...state, labelSamplingStrategy: action.payload };
    case 'SET_LABEL_SAMPLING_THRESHOLD':
      return { ...state, labelSamplingThreshold: action.payload };
    case 'SET_LABEL_SAMPLE_EVERY':
      return { ...state, labelSampleEvery: Math.max(1, action.payload) };
    // Tooltip reducers
    case 'SET_TOOLTIP_FIELDS': {
      if (sameFieldArray(state.tooltipFields, action.payload)) return state;
      return { ...state, tooltipFields: action.payload, queryVersion: state.queryVersion + 1 };
    }
    case 'ADD_TOOLTIP_FIELD': {
      if (state.tooltipFields.some(f => f.columnName === action.payload.columnName)) return state; // no change
      const newFields = [...state.tooltipFields, action.payload];
      return { ...state, tooltipFields: newFields, queryVersion: state.queryVersion + 1 };
    }
    case 'REMOVE_TOOLTIP_FIELD': {
      const newFields = state.tooltipFields.filter(f => f.id !== action.payload && f.columnName !== action.payload);
      if (newFields.length === state.tooltipFields.length) return state; // nothing removed
      return { ...state, tooltipFields: newFields, queryVersion: state.queryVersion + 1 };
    }
    // Virtual column reducers
    case 'SET_VIRTUAL_COLUMNS': {
      // Simple length + names check to avoid bump on identical content
      const sameLen = state.virtualColumns.length === action.payload.length;
      const sameNames = sameLen && state.virtualColumns.every((vc, i) => vc.name === action.payload[i].name && vc.expression === action.payload[i].expression);
      if (sameNames) return state;
      return { ...state, virtualColumns: action.payload, queryVersion: state.queryVersion + 1 };
    }
    case 'ADD_VIRTUAL_COLUMN':
      return { ...state, virtualColumns: [...state.virtualColumns, action.payload], queryVersion: state.queryVersion + 1 };
    case 'UPDATE_VIRTUAL_COLUMN': {
      const newColumns = [...state.virtualColumns];
      const prev = newColumns[action.payload.index];
      newColumns[action.payload.index] = action.payload.column;
      const changed = !prev || prev.name !== action.payload.column.name || prev.expression !== action.payload.column.expression;
      return { ...state, virtualColumns: newColumns, queryVersion: changed ? state.queryVersion + 1 : state.queryVersion };
    }
    case 'REMOVE_VIRTUAL_COLUMN': {
      if (action.payload < 0 || action.payload >= state.virtualColumns.length) return state;
      const removedColumn = state.virtualColumns[action.payload];
      const newPreferences = { ...state.virtualColumnFieldPreferences };
      delete newPreferences[removedColumn.name];
      return { 
        ...state, 
        virtualColumns: state.virtualColumns.filter((_, i) => i !== action.payload),
        virtualColumnFieldPreferences: newPreferences,
        queryVersion: state.queryVersion + 1,
      };
    }
    case 'UPDATE_VIRTUAL_COLUMN_FIELD_PREFERENCE': {
      return {
        ...state,
        virtualColumnFieldPreferences: {
          ...state.virtualColumnFieldPreferences,
          [action.payload.columnName]: {
            ...state.virtualColumnFieldPreferences[action.payload.columnName],
            ...action.payload.preference,
          },
        },
      };
    }
    // Per-field chart override reducers
    case 'SET_FIELD_OVERRIDES':
      return { ...state, fieldOverrides: action.payload }; // overrides do not change query semantics directly
    case 'UPDATE_FIELD_OVERRIDE': {
      const { fieldId, override } = action.payload;
      const existing = state.fieldOverrides[fieldId] || {};
      // Check if this update affects query-relevant fields (color, size, or label)
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
      // Check if the override being cleared affects query-relevant fields
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
        virtualColumns: action.payload.virtualColumns,
        virtualColumnFieldPreferences: action.payload.virtualColumnFieldPreferences || {},
        fieldOverrides: action.payload.fieldOverrides || {},
        queryVersion: state.queryVersion + 1,
      };
    case 'RESET_STATE':
      return initialState;
    case 'TABLE_JOINS_UNIONS_MODIFIED':
      // When joins or unions are modified, increment query version to trigger re-execution
      return { ...state, queryVersion: state.queryVersion + 1 };
    default:
      return state;
  }
}

// Context interface
interface VisualizationContextType {
  state: VisualizationState;
  dispatch: React.Dispatch<VisualizationAction>;
  // New methods for loading management
  startOperation: (operationType: LoadingOperationType, canCancel?: boolean) => void;
  completeOperation: (operationType: LoadingOperationType) => void; // Updated signature
  cancelOperation: () => void;
  // Timeout management
  timeoutRefs: React.MutableRefObject<{ [key: string]: NodeJS.Timeout | null }>;
  // Undo/Redo helper
  getUndoableSnapshot: () => {
    xAxisFields: Field[];
    yAxisFields: Field[];
    filterFields: Field[];
    filterConfigurations: Record<string, FilterConfig>;
    appliedFilterConfigurations: Record<string, FilterConfig>;
    colorField: Field | null;
    colorScheme: string;
    colorBias: number;
    sizeField: Field | null;
    sizeRange: [number, number];
    manualSize: number;
    tooltipFields: Field[];
    virtualColumns: VirtualColumnDefinition[];
    fieldOverrides: Record<string, FieldOverrideState>;
  };
}

// Create context
const VisualizationContext = createContext<VisualizationContextType | undefined>(undefined);

// Provider component
interface VisualizationProviderProps {
  children: ReactNode;
  initialState?: Partial<VisualizationState>;
}

export function VisualizationProvider({ children, initialState: initialStateProp }: VisualizationProviderProps) {
  // Merge the default initial state with any provided initial state
  const mergedInitialState = React.useMemo(() => {
    const merged = {
      ...initialState,
      ...initialStateProp,
    };
    return merged;
  }, [initialStateProp]);

  const [state, dispatch] = useReducer(visualizationReducer, mergedInitialState);
  const timeoutRefs = useRef<{ [key: string]: NodeJS.Timeout | null }>({});

  // Start an operation with timeout handling
  // startOperation now records both legacy global start time and per-operation time.
  // Legacy fields (loadingStartTime, loadingOperationType) remain for current modal component.
  // New fields (operationStartTimes, activeOperations, modalPrimaryOperation) will support multi-operation modal.
  // Rationale for ENSURE_PRIMARY_OPERATION & recompute logic:
  // Previously the timeout closure captured stale state and could set a primary after completion,
  // leaving the modal in a state where cancel button appeared unresponsive (operation already finished).
  // We now:
  //  1. Use reducer-based ENSURE_PRIMARY_OPERATION to avoid stale closure checks.
  //  2. Recompute primary whenever an operation completes and the modal is still open.
  //  3. Clear start time for completed operations to prevent elapsed calculations from growing indefinitely.
  // This prevents hanging dialogs when a quick rendering follows a long query.
  const startOperation = useCallback((operationType: LoadingOperationType, canCancel: boolean = true) => {
    
    // Clear any existing timeout for this operation
    if (timeoutRefs.current[operationType]) {
      clearTimeout(timeoutRefs.current[operationType]!);
    }

  // Global legacy start time retained for existing modal display
  const now = Date.now();
  dispatch({ type: 'SET_LOADING_START_TIME', payload: now });
  // Record per-operation start time if not already set
  dispatch({ type: 'SET_OPERATION_START_TIME', payload: { op: operationType, time: now } });
  // Track active operation list
  dispatch({ type: 'ADD_ACTIVE_OPERATION', payload: operationType });
    
    switch (operationType) {
      case 'query':
        dispatch({ type: 'SET_LOADING_QUERY', payload: true });
        break;
      case 'rendering':
        dispatch({ type: 'SET_LOADING_RENDERING', payload: true });
        break;
      case 'metadata':
        dispatch({ type: 'SET_LOADING_METADATA', payload: true });
        break;
    }

    // Set timeout to show modal
    const timeoutMs = getTimeoutForOperation(operationType);
    
    timeoutRefs.current[operationType] = setTimeout(() => {
      // Timeout path now dispatches two guarded actions:
      // 1) ENSURE_PRIMARY_OPERATION will only select this op if still active and there is no primary.
      // 2) REQUEST_SHOW_MODAL will only show the modal if the op is still active at timeout fire.
      // This eliminates cases where a very fast follow-up operation closes state before timeout,
      // leaving the modal clock at 0:00 and cancel disabled due to missing active op linkage.
      dispatch({ type: 'ENSURE_PRIMARY_OPERATION', payload: operationType });
      dispatch({ type: 'REQUEST_SHOW_MODAL', payload: { operationType, canCancel } });
    }, timeoutMs);
  }, []);

  // Complete an operation
  // completeOperation updates legacy flags plus removes the operation from new tracking lists.
  const completeOperation = useCallback((operationType: LoadingOperationType) => {
    
    // Clear only the specific timeout
    if (timeoutRefs.current[operationType]) {
      clearTimeout(timeoutRefs.current[operationType]!);
      timeoutRefs.current[operationType] = null; // Mark as cleared
    }

    // Remove from active operations list; recompute primary inside reducer logic
    dispatch({ type: 'REMOVE_ACTIVE_OPERATION', payload: operationType });
    dispatch({ type: 'COMPLETE_SPECIFIC_OPERATION', payload: operationType });
  }, []);

  // Cancel an operation
  const cancelOperation = useCallback(() => {
    console.log('❌ Operation cancelled');
    
    // Clear all timeouts
    Object.values(timeoutRefs.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    timeoutRefs.current = {};

    // Reset states
    dispatch({ type: 'CANCEL_OPERATION' });
  }, []);

  // Cleanup timeouts on unmount
  React.useEffect(() => {
    return () => {
      Object.values(timeoutRefs.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  // Get undoable state snapshot
  const getUndoableSnapshot = useCallback(() => {
    return {
      xAxisFields: state.xAxisFields,
      yAxisFields: state.yAxisFields,
      filterFields: state.filterFields,
      filterConfigurations: state.filterConfigurations,
      appliedFilterConfigurations: state.appliedFilterConfigurations,
      colorField: state.colorField,
      colorScheme: state.colorScheme,
      colorBias: state.colorBias,
      sizeField: state.sizeField,
      sizeRange: state.sizeRange,
      manualSize: state.manualSize,
      tooltipFields: state.tooltipFields,
      virtualColumns: state.virtualColumns,
      virtualColumnFieldPreferences: state.virtualColumnFieldPreferences,
      fieldOverrides: state.fieldOverrides,
    };
  }, [
    state.xAxisFields,
    state.yAxisFields,
    state.filterFields,
    state.filterConfigurations,
    state.appliedFilterConfigurations,
    state.colorField,
    state.colorScheme,
    state.colorBias,
    state.sizeField,
    state.sizeRange,
    state.manualSize,
    state.tooltipFields,
    state.virtualColumns,
    state.virtualColumnFieldPreferences,
    state.fieldOverrides,
  ]);

  return (
    <VisualizationContext.Provider value={{ 
      state, 
      dispatch, 
      startOperation, 
      completeOperation, 
      cancelOperation, 
      timeoutRefs,
      getUndoableSnapshot
    }}>
      {children}
    </VisualizationContext.Provider>
  );
}

// Custom hook to use the context
export function useVisualizationContext() {
  const context = useContext(VisualizationContext);
  if (context === undefined) {
    throw new Error('useVisualizationContext must be used within a VisualizationProvider');
  }
  return context;
}