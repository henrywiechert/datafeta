import { VisualizationState, VisualizationAction } from '../types';
import { axisReducer } from './axisReducer';
import { loadingReducer } from './loadingReducer';
import { filterReducer } from './filterReducer';
import { encodingReducer } from './encodingReducer';
import { overridesReducer } from './overridesReducer';
import { undoRedoReducer } from './undoRedoReducer';
import { optimizationReducer } from './optimizationReducer';
import { measureGroupReducer } from './measureGroupReducer';

/**
 * Combined reducer that delegates to domain-specific reducers.
 * Each sub-reducer returns null if it doesn't handle the action.
 */
export function visualizationReducer(state: VisualizationState, action: VisualizationAction): VisualizationState {
  // Try each reducer in order - first one to handle wins
  const reducers = [
    axisReducer,
    loadingReducer,
    filterReducer,
    encodingReducer,
    overridesReducer,
    undoRedoReducer,
    optimizationReducer,
    measureGroupReducer,
  ];

  for (const reducer of reducers) {
    const result = reducer(state, action);
    if (result !== null) {
      return result;
    }
  }

  // No reducer handled this action - return state unchanged
  return state;
}

