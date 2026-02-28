/**
 * Shared filter action utilities.
 *
 * Extracted so that both drag-and-drop (useDragDrop) and the legend-to-filter
 * bridge (ChartArea) can create / update discrete filters through a single
 * code path — avoiding logic duplication and keeping one source of truth.
 */

import { v4 as uuidv4 } from 'uuid';
import { Field, DiscreteFilterConfig } from '../types';
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
    dateTimePart,
    dateTimeMode,
  };

  dispatch({
    type: 'SET_FILTER_CONFIGURATION',
    payload: { fieldId: existingFilterFieldId, config },
  });

  dispatch({ type: 'APPLY_FILTERS' });
}
