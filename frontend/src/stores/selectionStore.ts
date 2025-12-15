import { create } from 'zustand';
import { flushSync } from 'react-dom';
import { Field, DragSource } from '../types';

export interface SelectedField {
  fieldId: string;
  source: DragSource;
  field: Field;
}

interface SelectionState {
  selectedFields: SelectedField[];
  anchorFieldId: string | null;
  anchorSource: DragSource | null;
}

interface SelectionActions {
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

export type SelectionStore = SelectionState & SelectionActions;

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  // State
  selectedFields: [],
  anchorFieldId: null,
  anchorSource: null,

  // Computed (read from current state without subscribing)
  isSelected: (fieldId, source) => {
    return get().selectedFields.some(sf => sf.fieldId === fieldId && sf.source === source);
  },

  getSelectedCount: () => get().selectedFields.length,

  getSelectedFieldsForSource: (source) => {
    return get().selectedFields.filter(sf => sf.source === source);
  },

  // Actions
  selectField: (fieldId, source, field) => {
    set((state) => {
      // If selecting from a different source, clear previous selection
      if (state.selectedFields.length > 0 && state.selectedFields[0].source !== source) {
        return {
          selectedFields: [{ fieldId, source, field }],
          anchorFieldId: fieldId,
          anchorSource: source,
        };
      }

      // Check if already selected
      if (state.selectedFields.some(sf => sf.fieldId === fieldId && sf.source === source)) {
        return state;
      }

      return {
        selectedFields: [...state.selectedFields, { fieldId, source, field }],
        anchorFieldId: fieldId,
        anchorSource: source,
      };
    });
  },

  selectSingle: (fieldId, source, field) => {
    // Use flushSync for immediate visual feedback
    flushSync(() => {
      set({
        selectedFields: [{ fieldId, source, field }],
        anchorFieldId: fieldId,
        anchorSource: source,
      });
    });
  },

  deselectField: (fieldId, source) => {
    set((state) => ({
      selectedFields: state.selectedFields.filter(
        sf => !(sf.fieldId === fieldId && sf.source === source)
      ),
      // Clear anchor if we're deselecting it
      anchorFieldId: state.anchorFieldId === fieldId ? null : state.anchorFieldId,
      anchorSource: state.anchorFieldId === fieldId ? null : state.anchorSource,
    }));
  },

  toggleSelection: (fieldId, source, field) => {
    set((state) => {
      // If selecting from a different source, clear previous selection and select this one
      if (state.selectedFields.length > 0 && state.selectedFields[0].source !== source) {
        return {
          selectedFields: [{ fieldId, source, field }],
          anchorFieldId: fieldId,
          anchorSource: source,
        };
      }

      const alreadySelected = state.selectedFields.some(
        sf => sf.fieldId === fieldId && sf.source === source
      );

      if (alreadySelected) {
        // Deselect
        const newSelectedFields = state.selectedFields.filter(
          sf => !(sf.fieldId === fieldId && sf.source === source)
        );
        return {
          selectedFields: newSelectedFields,
          anchorFieldId: newSelectedFields.length > 0 ? state.anchorFieldId : null,
          anchorSource: newSelectedFields.length > 0 ? state.anchorSource : null,
        };
      } else {
        // Select
        return {
          selectedFields: [...state.selectedFields, { fieldId, source, field }],
          anchorFieldId: fieldId,
          anchorSource: source,
        };
      }
    });
  },

  selectRange: (fromFieldId, toFieldId, source, allFields) => {
    // Find indices of the range
    const fromIndex = allFields.findIndex(f => f.id === fromFieldId);
    const toIndex = allFields.findIndex(f => f.id === toFieldId);

    if (fromIndex === -1 || toIndex === -1) {
      console.warn('[SelectionStore] selectRange: field not found in allFields', {
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
    set({
      selectedFields: rangeFields,
      anchorFieldId: fromFieldId,
      anchorSource: source,
    });
  },

  clearSelection: () => {
    // Use flushSync for immediate visual feedback
    flushSync(() => {
      set({
        selectedFields: [],
        anchorFieldId: null,
        anchorSource: null,
      });
    });
  },

  clearSelectionIfDifferentSource: (source) => {
    set((state) => {
      if (state.selectedFields.length > 0 && state.selectedFields[0].source !== source) {
        return {
          selectedFields: [],
          anchorFieldId: null,
          anchorSource: null,
        };
      }
      return state;
    });
  },
}));
