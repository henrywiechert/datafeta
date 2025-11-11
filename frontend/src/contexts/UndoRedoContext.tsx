import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { VisualizationStateSnapshot } from '../types';

const MAX_HISTORY_SIZE = 50;

interface UndoRedoState {
  undoStack: VisualizationStateSnapshot[];
  redoStack: VisualizationStateSnapshot[];
}

interface UndoRedoContextType {
  recordAction: (currentState: VisualizationStateSnapshot) => void;
  undo: () => VisualizationStateSnapshot | null;
  completeUndo: (currentState: VisualizationStateSnapshot) => void;
  redo: () => VisualizationStateSnapshot | null;
  completeRedo: (currentState: VisualizationStateSnapshot) => void;
  clearHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const UndoRedoContext = createContext<UndoRedoContextType | undefined>(undefined);

export function UndoRedoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UndoRedoState>({
    undoStack: [],
    redoStack: [],
  });

  // Flag to prevent recording undo/redo operations themselves
  const isPerformingUndoRedo = useRef(false);

  // Deep clone a state snapshot to avoid reference issues
  const cloneSnapshot = useCallback((snapshot: VisualizationStateSnapshot): VisualizationStateSnapshot => {
    return JSON.parse(JSON.stringify(snapshot));
  }, []);

  // Record an action by pushing current state to undo stack
  const recordAction = useCallback((currentState: VisualizationStateSnapshot) => {
    // Don't record if we're currently performing an undo/redo
    if (isPerformingUndoRedo.current) {
      return;
    }

    setState(prevState => {
      // Clone the state to prevent reference issues
      const clonedState = JSON.parse(JSON.stringify(currentState)) as VisualizationStateSnapshot;
      
      // Add to undo stack with size limit
      const newUndoStack = [...prevState.undoStack, clonedState].slice(-MAX_HISTORY_SIZE);
      
      // Clear redo stack when a new action is recorded
      return {
        undoStack: newUndoStack,
        redoStack: [],
      };
    });
  }, []);

  // Undo the last action
  const undo = useCallback((): VisualizationStateSnapshot | null => {
    if (state.undoStack.length === 0) {
      return null;
    }

    isPerformingUndoRedo.current = true;

    // Get the last state from undo stack
    const previousState = state.undoStack[state.undoStack.length - 1];
    
    // Return the cloned state to restore
    return cloneSnapshot(previousState);
  }, [state.undoStack, cloneSnapshot]);

  // Complete the undo operation by updating stacks
  const completeUndo = useCallback((currentState: VisualizationStateSnapshot) => {
    setState(prevState => {
      if (prevState.undoStack.length === 0) {
        isPerformingUndoRedo.current = false;
        return prevState;
      }

      // Clone current state and add to redo stack
      const clonedCurrent = JSON.parse(JSON.stringify(currentState)) as VisualizationStateSnapshot;
      
      // Remove last item from undo stack
      const newUndoStack = prevState.undoStack.slice(0, -1);
      
      // Add current state to redo stack
      const newRedoStack = [...prevState.redoStack, clonedCurrent];

      isPerformingUndoRedo.current = false;

      return {
        undoStack: newUndoStack,
        redoStack: newRedoStack,
      };
    });
  }, []);

  // Redo the last undone action
  const redo = useCallback((): VisualizationStateSnapshot | null => {
    if (state.redoStack.length === 0) {
      return null;
    }

    isPerformingUndoRedo.current = true;

    // Get the last state from redo stack
    const nextState = state.redoStack[state.redoStack.length - 1];
    
    // Return the cloned state to restore
    return cloneSnapshot(nextState);
  }, [state.redoStack, cloneSnapshot]);

  // Complete the redo operation by updating stacks
  const completeRedo = useCallback((currentState: VisualizationStateSnapshot) => {
    setState(prevState => {
      if (prevState.redoStack.length === 0) {
        isPerformingUndoRedo.current = false;
        return prevState;
      }

      // Clone current state and add to undo stack
      const clonedCurrent = JSON.parse(JSON.stringify(currentState)) as VisualizationStateSnapshot;
      
      // Remove last item from redo stack
      const newRedoStack = prevState.redoStack.slice(0, -1);
      
      // Add current state to undo stack
      const newUndoStack = [...prevState.undoStack, clonedCurrent].slice(-MAX_HISTORY_SIZE);

      isPerformingUndoRedo.current = false;

      return {
        undoStack: newUndoStack,
        redoStack: newRedoStack,
      };
    });
  }, []);

  // Clear all history
  const clearHistory = useCallback(() => {
    setState({
      undoStack: [],
      redoStack: [],
    });
    isPerformingUndoRedo.current = false;
  }, []);

  return (
    <UndoRedoContext.Provider
      value={{
        recordAction,
        undo,
        completeUndo,
        redo,
        completeRedo,
        clearHistory,
        canUndo: state.undoStack.length > 0,
        canRedo: state.redoStack.length > 0,
      }}
    >
      {children}
    </UndoRedoContext.Provider>
  );
}

export function useUndoRedo() {
  const context = useContext(UndoRedoContext);
  if (context === undefined) {
    throw new Error('useUndoRedo must be used within an UndoRedoProvider');
  }
  return context;
}

