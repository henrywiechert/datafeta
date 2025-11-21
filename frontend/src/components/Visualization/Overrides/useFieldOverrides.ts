import { useMemo } from 'react';
import { Field, FieldOverrideState } from '../../../types';

interface UseFieldOverridesProps {
  xAxisFields: Field[];
  yAxisFields: Field[];
  filterFields: Field[];
  availableFields: Field[];
  colorField: Field | null;
  sizeField: Field | null;
  fieldOverrides: Record<string, FieldOverrideState>;
  colorScheme: string;
  colorBias: number;
  dispatch: (action: any) => void;
  recordAction: (snapshot: any) => void;
  getUndoableSnapshot: () => any;
}

interface FieldOverrideHandlers {
  handleUpdateOverride: (fieldId: string, patch: Partial<FieldOverrideState>) => void;
  handleClearOverride: (fieldId: string) => void;
  clearColorOverridesForAllFields: () => void;
  clearSizeOverridesForAllFields: () => void;
  clearLabelOverridesForAllFields: () => void;
  fieldById: Record<string, Field>;
  resolveColorField: (override: FieldOverrideState) => Field | null;
  resolveSizeField: (override: FieldOverrideState) => Field | null;
}

export const useFieldOverrides = (props: UseFieldOverridesProps): FieldOverrideHandlers => {
  const {
    xAxisFields,
    yAxisFields,
    filterFields,
    availableFields,
    colorField,
    sizeField,
    fieldOverrides,
    dispatch,
    recordAction,
    getUndoableSnapshot,
  } = props;

  // Build a lookup of all known fields by id
  const fieldById = useMemo(() => {
    const all: Field[] = [
      ...xAxisFields,
      ...yAxisFields,
      ...filterFields,
      ...availableFields,
    ];
    // Include current color and size fields if they exist
    if (colorField) all.push(colorField);
    if (sizeField) all.push(sizeField);

    const map: Record<string, Field> = {};
    for (const f of all) {
      if (!map[f.id]) {
        map[f.id] = f;
      }
    }
    return map;
  }, [xAxisFields, yAxisFields, filterFields, availableFields, colorField, sizeField]);

  const handleUpdateOverride = (fieldId: string, patch: Partial<FieldOverrideState>) => {
    recordAction(getUndoableSnapshot());
    dispatch({
      type: 'UPDATE_FIELD_OVERRIDE',
      payload: { fieldId, override: patch },
    });
  };

  const handleClearOverride = (fieldId: string) => {
    recordAction(getUndoableSnapshot());
    dispatch({
      type: 'CLEAR_FIELD_OVERRIDE',
      payload: { fieldId },
    });
  };

  const clearColorOverridesForAllFields = () => {
    const next: typeof fieldOverrides = {};
    Object.entries(fieldOverrides || {}).forEach(([id, override]: any) => {
      const { colorFieldId, colorField, colorScheme, colorBias, manualColor, ...rest } = override || {};
      next[id] = rest;
    });
    dispatch({ type: 'SET_FIELD_OVERRIDES', payload: next });
  };

  const clearSizeOverridesForAllFields = () => {
    const next: typeof fieldOverrides = {};
    Object.entries(fieldOverrides || {}).forEach(([id, override]: any) => {
      const { sizeFieldId, sizeField, sizeRange, manualSize, ...rest } = override || {};
      next[id] = rest;
    });
    dispatch({ type: 'SET_FIELD_OVERRIDES', payload: next });
  };

  const clearLabelOverridesForAllFields = () => {
    const next: typeof fieldOverrides = {};
    Object.entries(fieldOverrides || {}).forEach(([id, override]: any) => {
      const { labelFields, ...rest } = override || {};
      next[id] = rest;
    });
    dispatch({ type: 'SET_FIELD_OVERRIDES', payload: next });
  };

  const resolveColorField = (override: FieldOverrideState): Field | null => {
    return override.colorField || (override.colorFieldId ? fieldById[override.colorFieldId] || null : null);
  };

  const resolveSizeField = (override: FieldOverrideState): Field | null => {
    return override.sizeField || (override.sizeFieldId ? fieldById[override.sizeFieldId] || null : null);
  };

  return {
    handleUpdateOverride,
    handleClearOverride,
    clearColorOverridesForAllFields,
    clearSizeOverridesForAllFields,
    clearLabelOverridesForAllFields,
    fieldById,
    resolveColorField,
    resolveSizeField,
  };
};

