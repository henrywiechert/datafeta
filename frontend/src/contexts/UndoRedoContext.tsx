// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { VisualizationStateSnapshot } from '../types';

const MAX_HISTORY_SIZE = 50;

interface UndoRedoStacks {
  undoStack: VisualizationStateSnapshot[];
  redoStack: VisualizationStateSnapshot[];
}

interface UndoRedoContextType {
  recordAction: (currentState: VisualizationStateSnapshot) => void;
  undo: () => VisualizationStateSnapshot | null;
  completeUndo: (currentState: VisualizationStateSnapshot) => void;
  redo: () => VisualizationStateSnapshot | null;
  completeRedo: (currentState: VisualizationStateSnapshot) => void;
  discardLastAction: () => void;
  clearHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const EMPTY_STACKS: UndoRedoStacks = { undoStack: [], redoStack: [] };

function updateSheetStacks(
  prev: Record<string, UndoRedoStacks>,
  sheetId: string,
  updater: (stacks: UndoRedoStacks) => UndoRedoStacks,
): Record<string, UndoRedoStacks> {
  return { ...prev, [sheetId]: updater(prev[sheetId] || EMPTY_STACKS) };
}

const UndoRedoContext = createContext<UndoRedoContextType | undefined>(undefined);

interface UndoRedoProviderProps {
  sheetId: string;
  children: React.ReactNode;
}

export function UndoRedoProvider({ sheetId, children }: UndoRedoProviderProps) {
  // Per-sheet undo/redo stacks keyed by sheet ID
  const [allStacks, setAllStacks] = useState<Record<string, UndoRedoStacks>>({});

  const currentStacks = allStacks[sheetId] || EMPTY_STACKS;

  const isPerformingUndoRedo = useRef(false);

  const cloneSnapshot = useCallback((snapshot: VisualizationStateSnapshot): VisualizationStateSnapshot => {
    return JSON.parse(JSON.stringify(snapshot));
  }, []);

  const recordAction = useCallback((currentState: VisualizationStateSnapshot) => {
    if (isPerformingUndoRedo.current) {
      return;
    }

    const clonedState = JSON.parse(JSON.stringify(currentState)) as VisualizationStateSnapshot;
    setAllStacks(prev => updateSheetStacks(prev, sheetId, stacks => ({
      undoStack: [...stacks.undoStack, clonedState].slice(-MAX_HISTORY_SIZE),
      redoStack: [],
    })));
  }, [sheetId]);

  const undo = useCallback((): VisualizationStateSnapshot | null => {
    const stacks = allStacks[sheetId] || EMPTY_STACKS;
    if (stacks.undoStack.length === 0) {
      return null;
    }

    isPerformingUndoRedo.current = true;
    const previousState = stacks.undoStack[stacks.undoStack.length - 1];
    return cloneSnapshot(previousState);
  }, [allStacks, sheetId, cloneSnapshot]);

  const completeUndo = useCallback((currentState: VisualizationStateSnapshot) => {
    const clonedCurrent = JSON.parse(JSON.stringify(currentState)) as VisualizationStateSnapshot;
    setAllStacks(prev => {
      const current = prev[sheetId] || EMPTY_STACKS;
      if (current.undoStack.length === 0) {
        isPerformingUndoRedo.current = false;
        return prev;
      }
      isPerformingUndoRedo.current = false;
      return updateSheetStacks(prev, sheetId, stacks => ({
        undoStack: stacks.undoStack.slice(0, -1),
        redoStack: [...stacks.redoStack, clonedCurrent],
      }));
    });
  }, [sheetId]);

  const redo = useCallback((): VisualizationStateSnapshot | null => {
    const stacks = allStacks[sheetId] || EMPTY_STACKS;
    if (stacks.redoStack.length === 0) {
      return null;
    }

    isPerformingUndoRedo.current = true;
    const nextState = stacks.redoStack[stacks.redoStack.length - 1];
    return cloneSnapshot(nextState);
  }, [allStacks, sheetId, cloneSnapshot]);

  const completeRedo = useCallback((currentState: VisualizationStateSnapshot) => {
    const clonedCurrent = JSON.parse(JSON.stringify(currentState)) as VisualizationStateSnapshot;
    setAllStacks(prev => {
      const current = prev[sheetId] || EMPTY_STACKS;
      if (current.redoStack.length === 0) {
        isPerformingUndoRedo.current = false;
        return prev;
      }
      isPerformingUndoRedo.current = false;
      return updateSheetStacks(prev, sheetId, stacks => ({
        undoStack: [...stacks.undoStack, clonedCurrent].slice(-MAX_HISTORY_SIZE),
        redoStack: stacks.redoStack.slice(0, -1),
      }));
    });
  }, [sheetId]);

  const discardLastAction = useCallback(() => {
    setAllStacks(prev => {
      const current = prev[sheetId] || EMPTY_STACKS;
      if (current.undoStack.length === 0) {
        return prev;
      }
      return updateSheetStacks(prev, sheetId, stacks => ({
        ...stacks,
        undoStack: stacks.undoStack.slice(0, -1),
      }));
    });
  }, [sheetId]);

  const clearHistory = useCallback(() => {
    setAllStacks(prev => {
      const { [sheetId]: _, ...rest } = prev;
      return rest;
    });
    isPerformingUndoRedo.current = false;
  }, [sheetId]);

  const value = useMemo(() => ({
    recordAction,
    undo,
    completeUndo,
    redo,
    completeRedo,
    discardLastAction,
    clearHistory,
    canUndo: currentStacks.undoStack.length > 0,
    canRedo: currentStacks.redoStack.length > 0,
  }), [recordAction, undo, completeUndo, redo, completeRedo, discardLastAction, clearHistory, currentStacks]);

  return (
    <UndoRedoContext.Provider value={value}>
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

