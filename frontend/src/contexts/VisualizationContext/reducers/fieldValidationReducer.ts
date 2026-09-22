// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../../types';
import { validateFields, validateOptionalField } from '../../../utils/fieldValidation';
import { VisualizationState, VisualizationAction } from '../types';
import { sameFieldArray } from './utils';

function sameField(a: Field | null, b: Field | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.isInvalid === b.isInvalid;
}

/**
 * Flags every field-bearing slot against the current schema, so an invalid
 * field reads the same wherever it sits — axis, filter, encoding override,
 * measure group or table column.
 *
 * This is the single place that enumerates those slots. Adding a new one to
 * VisualizationState means adding it here, rather than remembering to patch it
 * at each of the call sites that validate after a schema change.
 *
 * Marking is display-only: `isInvalid` is not read by the query builder or the
 * view planner (`disabled` is the flag that excludes a field from a query).
 *
 * Passing empty name sets marks everything invalid, which is the "no table
 * selected, nothing left to validate against" case.
 */
export function fieldValidationReducer(
  state: VisualizationState,
  action: VisualizationAction,
): VisualizationState | null {
  if (action.type !== 'VALIDATE_ALL_FIELDS') return null;

  const validNames = new Set(action.payload.validNames);
  // Measure group members are measures: a column that still exists but is no
  // longer a measure does not qualify. This is the set the old
  // PRUNE_MEASURE_GROUP_MEMBERS used before members were marked instead of
  // dropped.
  const validMeasureNames = new Set(action.payload.validMeasureNames);

  const xAxisFields = validateFields(state.xAxisFields, validNames);
  const yAxisFields = validateFields(state.yAxisFields, validNames);
  const filterFields = validateFields(state.filterFields, validNames);
  const labelFields = validateFields(state.labelFields, validNames);
  const tooltipFields = validateFields(state.tooltipFields, validNames);
  const tableColumnFields = validateFields(state.tableColumnFields, validNames);
  const colorField = validateOptionalField(state.colorField, validNames);
  const sizeField = validateOptionalField(state.sizeField, validNames);
  const shapeField = validateOptionalField(state.shapeField, validNames);
  const facetBackgroundField = validateOptionalField(state.facetBackgroundField, validNames);
  const members = validateFields(state.measureGroup.members, validMeasureNames);

  const unchanged =
    sameFieldArray(state.xAxisFields, xAxisFields) &&
    sameFieldArray(state.yAxisFields, yAxisFields) &&
    sameFieldArray(state.filterFields, filterFields) &&
    sameFieldArray(state.labelFields, labelFields) &&
    sameFieldArray(state.tooltipFields, tooltipFields) &&
    sameFieldArray(state.tableColumnFields, tableColumnFields) &&
    sameFieldArray(state.measureGroup.members, members) &&
    sameField(state.colorField, colorField) &&
    sameField(state.sizeField, sizeField) &&
    sameField(state.shapeField, shapeField) &&
    sameField(state.facetBackgroundField, facetBackgroundField);

  // Identity-stable no-op: this runs after every schema fetch, and a fresh
  // state object would re-render the whole sheet each time.
  if (unchanged) return state;

  // queryVersion is deliberately untouched — flagging a field changes how it
  // is drawn, not what is queried.
  return {
    ...state,
    xAxisFields,
    yAxisFields,
    filterFields,
    labelFields,
    tooltipFields,
    tableColumnFields,
    colorField,
    sizeField,
    shapeField,
    facetBackgroundField,
    measureGroup: { ...state.measureGroup, members },
  };
}
