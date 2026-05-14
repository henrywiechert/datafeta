// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared filter action utilities.
 *
 * Extracted so that both drag-and-drop (useDragDrop) and the legend-to-filter
 * bridge (ChartArea) can create / update discrete filters through a single
 * code path — avoiding logic duplication and keeping one source of truth.
 */

import { v4 as uuidv4 } from 'uuid';
import { Field, DiscreteFilterConfig, ContinuousFilterConfig, DateTimeFilterConfig } from '../types';
import { VisualizationAction } from '../contexts/VisualizationContext';

// Re-export for convenience so callers don't need an extra import
export type Dispatch = React.Dispatch<VisualizationAction>;

/**
 * Create a new discrete filter field from an existing Field (e.g. the color
 * field) and immediately configure + apply it.
 *
 * The config is pre-seeded *before* metadata arrives so that
 * `useFilterMetadata`'s auto-init guard (`if (!filterConfigurations[field.id])`)
 * is satisfied and does not overwrite our selection.
 *
 * @returns The newly created filter Field (with its new id)
 */
export function addFieldAsDiscreteFilter(
  sourceField: Field,
  selectedValues: any[],
  currentFilterFields: Field[],
  dispatch: Dispatch,
): Field {
  // Clone the source field with a fresh ID, force discrete flavour
  const filterField: Field = {
    ...sourceField,
    id: uuidv4(),
    flavour: 'discrete',
  };

  // 1. Append to the filter field list
  dispatch({
    type: 'SET_FILTER_FIELDS',
    payload: [...currentFilterFields, filterField],
  });

  // 2. Pre-seed the filter configuration
  const config: DiscreteFilterConfig = {
    fieldId: filterField.id,
    columnName: filterField.columnName,
    type: 'discrete',
    selectedValues,
    matchMode: 'selection',
    dateTimePart: filterField.dateTimePart,
    dateTimeMode: filterField.dateTimeMode,
  };

  dispatch({
    type: 'SET_FILTER_CONFIGURATION',
    payload: { fieldId: filterField.id, config },
  });

  // 3. Auto-apply so the query re-executes immediately
  dispatch({ type: 'APPLY_FILTERS' });

  return filterField;
}

/**
 * Update an existing discrete filter's selected values and auto-apply.
 */
export function updateExistingDiscreteFilter(
  existingFilterFieldId: string,
  columnName: string,
  newSelectedValues: any[],
  dispatch: Dispatch,
  dateTimePart?: Field['dateTimePart'],
  dateTimeMode?: Field['dateTimeMode'],
): void {
  const config: DiscreteFilterConfig = {
    fieldId: existingFilterFieldId,
    columnName,
    type: 'discrete',
    selectedValues: newSelectedValues,
    matchMode: 'selection',
    dateTimePart,
    dateTimeMode,
  };

  dispatch({
    type: 'SET_FILTER_CONFIGURATION',
    payload: { fieldId: existingFilterFieldId, config },
  });

  dispatch({ type: 'APPLY_FILTERS' });
}

/**
 * Create a new continuous (min/max) filter from an axis field and immediately
 * configure + apply it. Used by the chart zoom brush.
 *
 * @returns The newly created filter Field (with its new id)
 */
export function addFieldAsContinuousFilter(
  sourceField: Field,
  min: number,
  max: number,
  currentFilterFields: Field[],
  dispatch: Dispatch,
): Field {
  const filterField: Field = {
    ...sourceField,
    id: uuidv4(),
    flavour: 'continuous',
  };

  dispatch({
    type: 'SET_FILTER_FIELDS',
    payload: [...currentFilterFields, filterField],
  });

  const config: ContinuousFilterConfig = {
    fieldId: filterField.id,
    columnName: filterField.columnName,
    type: 'continuous',
    min,
    max,
    isZoomFilter: true,
  };

  dispatch({
    type: 'SET_FILTER_CONFIGURATION',
    payload: { fieldId: filterField.id, config },
  });

  dispatch({ type: 'APPLY_FILTERS' });

  return filterField;
}

/**
 * Update an existing continuous filter's range and auto-apply.
 * Used by the chart zoom brush when narrowing an existing zoom, or by zoom-out.
 */
export function updateExistingContinuousFilter(
  existingFilterFieldId: string,
  columnName: string,
  min: number,
  max: number,
  dispatch: Dispatch,
): void {
  const config: ContinuousFilterConfig = {
    fieldId: existingFilterFieldId,
    columnName,
    type: 'continuous',
    min,
    max,
    isZoomFilter: true,
  };

  dispatch({
    type: 'SET_FILTER_CONFIGURATION',
    payload: { fieldId: existingFilterFieldId, config },
  });

  dispatch({ type: 'APPLY_FILTERS' });
}

/**
 * Create a new discrete zoom filter from an axis field (band/categorical axis)
 * and immediately configure + apply it. Used by the chart zoom brush.
 *
 * @returns The newly created filter Field (with its new id)
 */
export function addFieldAsDiscreteZoomFilter(
  sourceField: Field,
  selectedValues: any[],
  currentFilterFields: Field[],
  dispatch: Dispatch,
): Field {
  const filterField: Field = {
    ...sourceField,
    id: uuidv4(),
    flavour: 'discrete',
  };

  dispatch({
    type: 'SET_FILTER_FIELDS',
    payload: [...currentFilterFields, filterField],
  });

  const config: DiscreteFilterConfig = {
    fieldId: filterField.id,
    columnName: filterField.columnName,
    type: 'discrete',
    selectedValues,
    matchMode: 'selection',
    isZoomFilter: true,
    dateTimePart: sourceField.dateTimePart,
    dateTimeMode: sourceField.dateTimeMode,
  };

  dispatch({
    type: 'SET_FILTER_CONFIGURATION',
    payload: { fieldId: filterField.id, config },
  });

  dispatch({ type: 'APPLY_FILTERS' });

  return filterField;
}

/**
 * Create a new DateTime zoom filter from an axis field and immediately
 * configure + apply it. Used by the chart zoom brush for temporal axes.
 *
 * @returns The newly created filter Field (with its new id)
 */
export function addFieldAsDateTimeZoomFilter(
  sourceField: Field,
  startDate: string,
  endDate: string,
  currentFilterFields: Field[],
  dispatch: Dispatch,
): Field {
  const filterField: Field = {
    ...sourceField,
    id: uuidv4(),
    flavour: 'continuous',
  };

  dispatch({
    type: 'SET_FILTER_FIELDS',
    payload: [...currentFilterFields, filterField],
  });

  const config: DateTimeFilterConfig = {
    fieldId: filterField.id,
    columnName: filterField.columnName,
    type: 'datetime',
    startDate,
    endDate,
    isZoomFilter: true,
  };

  dispatch({
    type: 'SET_FILTER_CONFIGURATION',
    payload: { fieldId: filterField.id, config },
  });

  dispatch({ type: 'APPLY_FILTERS' });

  return filterField;
}

/**
 * Update an existing DateTime filter's date range and auto-apply.
 * Used by the chart zoom brush when narrowing an existing zoom, or by zoom-out.
 */
export function updateExistingDateTimeFilter(
  existingFilterFieldId: string,
  columnName: string,
  startDate: string,
  endDate: string,
  dispatch: Dispatch,
): void {
  const config: DateTimeFilterConfig = {
    fieldId: existingFilterFieldId,
    columnName,
    type: 'datetime',
    startDate,
    endDate,
    isZoomFilter: true,
  };

  dispatch({
    type: 'SET_FILTER_CONFIGURATION',
    payload: { fieldId: existingFilterFieldId, config },
  });

  dispatch({ type: 'APPLY_FILTERS' });
}
