import { VisualizationState, VisualizationAction } from '../types';

/**
 * Handles loading-related actions: query/rendering loading states,
 * modal management, operation tracking, and cancellation.
 */
export function loadingReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
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
      if (state.modalPrimaryOperation) return state;
      if (!state.activeOperations.includes(action.payload)) return state;
      return { ...state, modalPrimaryOperation: action.payload };
    }
    case 'REQUEST_SHOW_MODAL': {
      if (!state.activeOperations.includes(action.payload.operationType)) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[VisualizationContext] REQUEST_SHOW_MODAL ignored - operation already completed:', action.payload.operationType);
        }
        return state;
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[VisualizationContext] Showing modal for operation:', action.payload.operationType);
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
    case 'COMPLETE_SPECIFIC_OPERATION': {
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
      
      if (updatedState.operationStartTimes[action.payload] != null) {
        updatedState.operationStartTimes = { ...updatedState.operationStartTimes, [action.payload]: null };
      }
      
      if (updatedState.activeOperations.includes(action.payload)) {
        updatedState.activeOperations = updatedState.activeOperations.filter(o => o !== action.payload);
      }
      
      if (updatedState.modalPrimaryOperation === action.payload) {
        const remaining = updatedState.activeOperations;
        if (remaining.length === 0) {
          updatedState.modalPrimaryOperation = null;
        } else {
          const longest = remaining.reduce((acc, op) => {
            const t = updatedState.operationStartTimes[op] || Infinity;
            const accT = updatedState.operationStartTimes[acc] || Infinity;
            return t < accT ? op : acc;
          }, remaining[0]);
          updatedState.modalPrimaryOperation = longest;
        }
      }
      
      if (updatedState.showLoadingModal && !updatedState.modalPrimaryOperation && updatedState.activeOperations.length > 0) {
        const longest = updatedState.activeOperations.reduce((acc, op) => {
          const t = updatedState.operationStartTimes[op] || Infinity;
          const accT = updatedState.operationStartTimes[acc] || Infinity;
          return t < accT ? op : acc;
        }, updatedState.activeOperations[0]);
        updatedState.modalPrimaryOperation = longest;
      }
      
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
    default:
      return null; // Not handled by this reducer
  }
}

