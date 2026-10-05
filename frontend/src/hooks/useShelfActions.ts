// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field } from '../types';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useRecordUndoPoint } from './useRecordUndoPoint';
import { resolveColorChannel } from '../utils/colorChannel';
import { isMeasureNamesField, isMeasureValuesField } from '../utils/syntheticFields';
import {
  DEFAULT_CATEGORICAL_SCHEME,
  DEFAULT_SEQUENTIAL_SCHEME,
  categoricalSchemes,
} from '../config/colorSchemes';
import {
  stripColorOverrides,
  stripLabelOverrides,
  stripSizeOverrides,
} from '../components/Visualization/Overrides/useFieldOverrides';

export interface ShelfActions {
  setColorField: (field: Field) => void;
  setSizeField: (field: Field) => void;
  setShapeField: (field: Field) => void;
  setLineStyleField: (field: Field) => void;
  addLabelField: (field: Field) => void;
  addTooltipField: (field: Field) => void;
  setBackgroundField: (field: Field) => void;
  addMeasureGroupMember: (field: Field) => void;
}

/**
 * Global (non-override) shelf assignments shared by the Properties drop zones
 * and the tablet tap-to-assign menu, so both paths produce identical state.
 *
 * Callers pass an already-resolved field instance (copy/flavour checks happen
 * at the drop site, e.g. via `resolveSingleEncodingDropField`), except for
 * `addMeasureGroupMember`, which filters and copies itself.
 *
 * Callbacks are stable: state is read from a ref at call time.
 */
export function useShelfActions(): ShelfActions {
  const { state, dispatch } = useVisualizationContext();
  const recordUndoPoint = useRecordUndoPoint();
  const stateRef = useRef(state);
  stateRef.current = state;

  return useMemo<ShelfActions>(() => ({
    setColorField: (field) => {
      const { colorField, colorScheme, colorBias, colorReversed, manualColor, fieldOverrides } = stateRef.current;
      const effectiveScheme = resolveColorChannel({
        field: colorField, scheme: colorScheme, bias: colorBias, reversed: colorReversed, manual: manualColor,
      }).scheme;
      const isCategoricalScheme = categoricalSchemes.some(s => s.id === effectiveScheme);
      recordUndoPoint();
      dispatch({ type: 'SET_FIELD_OVERRIDES', payload: stripColorOverrides(fieldOverrides) });
      dispatch({ type: 'SET_COLOR_FIELD', payload: field });
      if (field.flavour === 'continuous' && isCategoricalScheme) {
        dispatch({ type: 'SET_COLOR_SCHEME', payload: DEFAULT_SEQUENTIAL_SCHEME });
      } else if (field.flavour === 'discrete' && !isCategoricalScheme) {
        dispatch({ type: 'SET_COLOR_SCHEME', payload: DEFAULT_CATEGORICAL_SCHEME });
      }
    },
    setSizeField: (field) => {
      recordUndoPoint();
      dispatch({ type: 'SET_FIELD_OVERRIDES', payload: stripSizeOverrides(stateRef.current.fieldOverrides) });
      dispatch({ type: 'SET_SIZE_FIELD', payload: field });
    },
    setShapeField: (field) => {
      recordUndoPoint();
      dispatch({ type: 'SET_SHAPE_FIELD', payload: field });
    },
    setLineStyleField: (field) => {
      recordUndoPoint();
      dispatch({ type: 'SET_LINE_STYLE_FIELD', payload: field });
    },
    addLabelField: (field) => {
      const { labelFields, fieldOverrides } = stateRef.current;
      const current = (labelFields as Field[]) || [];
      if (current.some((f) => f.id === field.id)) return;
      recordUndoPoint();
      dispatch({ type: 'SET_FIELD_OVERRIDES', payload: stripLabelOverrides(fieldOverrides) });
      dispatch({ type: 'SET_LABEL_FIELDS', payload: [...current, field] });
    },
    addTooltipField: (field) => {
      const current = (stateRef.current.tooltipFields as Field[]) || [];
      if (current.some((f) => f.columnName === field.columnName)) return;
      recordUndoPoint();
      dispatch({ type: 'ADD_TOOLTIP_FIELD', payload: field });
    },
    setBackgroundField: (field) => {
      recordUndoPoint();
      dispatch({ type: 'SET_FACET_BACKGROUND_FIELD', payload: field });
    },
    addMeasureGroupMember: (field) => {
      if (isMeasureNamesField(field) || isMeasureValuesField(field)) return;
      if (field.type !== 'measure') return;
      // Fresh instance id: the member id is the stable key for per-member overrides.
      // Same column with a different aggregation is a distinct member (Tableau-style);
      // exact duplicates are rejected by the reducer.
      dispatch({
        type: 'ADD_MEASURE_GROUP_MEMBER',
        payload: { ...field, id: uuidv4(), axis: undefined },
      });
    },
  }), [dispatch, recordUndoPoint]);
}
