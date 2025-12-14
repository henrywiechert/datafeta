import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Field, DragSource } from '../types';

interface SelectedField {
  fieldId: string;
  source: DragSource;
  field: Field;
}

interface SelectionState {
  selectedFields: SelectedField[];
  anchorFieldId: string | null;
  anchorSource: DragSource | null;
}

// Callbacks context - stable, never changes
interface SelectionCallbacksType {
  isSelected: (fieldId: string, source: DragSource) => boolean;
  getSelectedCount: () => number;
  getSelectedFieldsForSource: (source: DragSource) => SelectedField[];
  selectField: (fieldId: string, source: DragSource, field: Field) => void;
  selectSingle: (fieldId: string, source: DragSource, field: Field) => void;
  deselectField: (fieldId: string, source: DragSource) => void;
  toggleSelection: (fieldId: string, source: DragSource, field: Field) => void;
  selectRange: (fromFieldId: string, toFieldId: string, source: DragSource, allFields: Field[]) => void;
  clearSelection: () => void;
  clearSelectionIfDifferentSource: (source: DragSource) => void;
}

// Full context type (includes state - causes re-renders when selection changes)
interface SelectionContextType extends SelectionCallbacksType {
  selectedFields: SelectedField[];
  anchorFieldId: string | null;
  anchorSource: DragSource | null;
}

// Two separate contexts: one for callbacks (stable), one for state (changes)
const SelectionCallbacksContext = createContext<SelectionCallbacksType | undefined>(undefined);
const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

/**
 * Use this hook when you ONLY need the stable callbacks (isSelected, getSelectedCount, etc.)
 * Components using this hook will NOT re-render when selection state changes.
 * The callbacks use refs internally to always return current state.
 */
export const useSelectionCallbacks = () => {
  const context = useContext(SelectionCallbacksContext);
  if (!context) {
    throw new Error('useSelectionCallbacks must be used within a SelectionProvider');
  }
  return context;
};

/**
 * Use this hook when you need access to the selection state (selectedFields, etc.)
 * Components using this hook WILL re-render when selection state changes.
 */
export const useSelection = () => {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return context;
};

interface SelectionProviderProps {
  children: ReactNode;
}

export const SelectionProvider: React.FC<SelectionProviderProps> = ({ children }) => {
  const [state, setState] = useState<SelectionState>({
    selectedFields: [],
    anchorFieldId: null,
    anchorSource: null,
  });

  // Use a ref to always have current state available without causing callback recreation
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // These callbacks use the ref so they don't need to recreate when state changes
  const isSelected = useCallback((fieldId: string, source: DragSource): boolean => {
    return stateRef.current.selectedFields.some(
      sf => sf.fieldId === fieldId && sf.source === source
    );
  }, []);

  const getSelectedCount = useCallback((): number => {
    return stateRef.current.selectedFields.length;
  }, []);

  const getSelectedFieldsForSource = useCallback((source: DragSource): SelectedField[] => {
    return stateRef.current.selectedFields.filter(sf => sf.source === source);
  }, []);

  const selectField = useCallback((fieldId: string, source: DragSource, field: Field) => {
    setState(prevState => {
      // If selecting from a different source, clear previous selection
      if (prevState.selectedFields.length > 0 && prevState.selectedFields[0].source !== source) {
        return {
          selectedFields: [{ fieldId, source, field }],
          anchorFieldId: fieldId,
          anchorSource: source,
        };
      }

      // Check if already selected
      const alreadySelected = prevState.selectedFields.some(
        sf => sf.fieldId === fieldId && sf.source === source
      );

      if (alreadySelected) {
        return prevState;
      }

      return {
        selectedFields: [...prevState.selectedFields, { fieldId, source, field }],
        anchorFieldId: fieldId,
        anchorSource: source,
      };
    });
  }, []);

  const selectSingle = useCallback((fieldId: string, source: DragSource, field: Field) => {
    // Atomically clear all selection and select only this field
    // This ensures the anchor is properly set to this field
    // Use flushSync for immediate visual feedback
    flushSync(() => {
      setState({
        selectedFields: [{ fieldId, source, field }],
        anchorFieldId: fieldId,
        anchorSource: source,
      });
    });
  }, []);

  const deselectField = useCallback((fieldId: string, source: DragSource) => {
    setState(prevState => ({
      ...prevState,
      selectedFields: prevState.selectedFields.filter(
        sf => !(sf.fieldId === fieldId && sf.source === source)
      ),
      // Clear anchor if we're deselecting it
      anchorFieldId: prevState.anchorFieldId === fieldId ? null : prevState.anchorFieldId,
      anchorSource: prevState.anchorFieldId === fieldId ? null : prevState.anchorSource,
    }));
  }, []);

  const toggleSelection = useCallback((fieldId: string, source: DragSource, field: Field) => {
    setState(prevState => {
      // If selecting from a different source, clear previous selection and select this one
      if (prevState.selectedFields.length > 0 && prevState.selectedFields[0].source !== source) {
        return {
          selectedFields: [{ fieldId, source, field }],
          anchorFieldId: fieldId,
          anchorSource: source,
        };
      }

      const alreadySelected = prevState.selectedFields.some(
        sf => sf.fieldId === fieldId && sf.source === source
      );

      if (alreadySelected) {
        // Deselect
        const newSelectedFields = prevState.selectedFields.filter(
          sf => !(sf.fieldId === fieldId && sf.source === source)
        );
        return {
          selectedFields: newSelectedFields,
          anchorFieldId: newSelectedFields.length > 0 ? prevState.anchorFieldId : null,
          anchorSource: newSelectedFields.length > 0 ? prevState.anchorSource : null,
        };
      } else {
        // Select
        return {
          selectedFields: [...prevState.selectedFields, { fieldId, source, field }],
          anchorFieldId: fieldId,
          anchorSource: source,
        };
      }
    });
  }, []);

  const selectRange = useCallback((
    fromFieldId: string,
    toFieldId: string,
    source: DragSource,
    allFields: Field[]
  ) => {
    // Find indices of the range
    const fromIndex = allFields.findIndex(f => f.id === fromFieldId);
    const toIndex = allFields.findIndex(f => f.id === toFieldId);

    console.log('[SelectionContext] selectRange called:', { 
      fromFieldId, 
      toFieldId, 
      source,
      fromIndex, 
      toIndex,
      allFieldsCount: allFields.length 
    });

    if (fromIndex === -1 || toIndex === -1) {
      console.warn('[SelectionContext] selectRange: field not found in allFields', {
        fromIndex,
        toIndex,
        fromFieldId,
        toFieldId
      });
      return;
    }

    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);

    const rangeFields = allFields
      .slice(startIndex, endIndex + 1)
      .map(field => ({
        fieldId: field.id,
        source,
        field,
      }));

    // Shift-click replaces selection with the range (standard behavior)
    // Don't merge with existing selection - just select the range
    setState({
      selectedFields: rangeFields,
      anchorFieldId: fromFieldId,
      anchorSource: source,
    });
  }, []);

  const clearSelection = useCallback(() => {
    // Use flushSync for immediate visual feedback
    flushSync(() => {
      setState({
        selectedFields: [],
        anchorFieldId: null,
        anchorSource: null,
      });
    });
  }, []);

  const clearSelectionIfDifferentSource = useCallback((source: DragSource) => {
    setState(prevState => {
      if (prevState.selectedFields.length > 0 && prevState.selectedFields[0].source !== source) {
        return {
          selectedFields: [],
          anchorFieldId: null,
          anchorSource: null,
        };
      }
      return prevState;
    });
  }, []);

  const value: SelectionContextType = useMemo(() => ({
    selectedFields: state.selectedFields,
    anchorFieldId: state.anchorFieldId,
    anchorSource: state.anchorSource,
    isSelected,
    getSelectedCount,
    getSelectedFieldsForSource,
    selectField,
    selectSingle,
    deselectField,
    toggleSelection,
    selectRange,
    clearSelection,
    clearSelectionIfDifferentSource,
  }), [
    state.selectedFields,
    state.anchorFieldId,
    state.anchorSource,
    isSelected,
    getSelectedCount,
    getSelectedFieldsForSource,
    selectField,
    selectSingle,
    deselectField,
    toggleSelection,
    selectRange,
    clearSelection,
    clearSelectionIfDifferentSource,
  ]);

  // Callbacks-only context - completely stable, never changes
  const callbacksValue: SelectionCallbacksType = useMemo(() => ({
    isSelected,
    getSelectedCount,
    getSelectedFieldsForSource,
    selectField,
    selectSingle,
    deselectField,
    toggleSelection,
    selectRange,
    clearSelection,
    clearSelectionIfDifferentSource,
  }), [
    isSelected,
    getSelectedCount,
    getSelectedFieldsForSource,
    selectField,
    selectSingle,
    deselectField,
    toggleSelection,
    selectRange,
    clearSelection,
    clearSelectionIfDifferentSource,
  ]);

  return (
    <SelectionCallbacksContext.Provider value={callbacksValue}>
      <SelectionContext.Provider value={value}>
        {children}
      </SelectionContext.Provider>
    </SelectionCallbacksContext.Provider>
  );
};