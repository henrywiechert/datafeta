/**
 * useTableRowsFilterActions – handles context-menu filter actions from TableViewRows.
 *
 * Supports:
 *  • "Keep only" – creates a discrete filter with only the selected value(s)
 *  • "Exclude"   – creates a discrete filter using excludedValues (NOT IN optimisation)
 *
 * Reuses the shared filterActions utilities so that filters appear in the
 * filter bar and participate in undo/redo like any other filter.
 */

import { useCallback, useMemo } from 'react';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import {
  addFieldAsDiscreteFilter,
  updateExistingDiscreteFilter,
} from '../../../../utils/filterActions';
import { getResultColumnName } from '../../../../utils/fieldUtils';
import type { Field, DiscreteFilterConfig } from '../../../../types';
import type { TableCellFilterAction } from '../../Table/TableViewRows';

interface UseTableRowsFilterActionsProps {
  recordAction: (snapshot: any) => void;
  getUndoableSnapshot: () => any;
}

export function useTableRowsFilterActions({
  recordAction,
  getUndoableSnapshot,
}: UseTableRowsFilterActionsProps) {
  const { state, dispatch } = useVisualizationContext();
  const { xAxisFields, yAxisFields, colorField, sizeField, labelFields, tooltipFields, filterFields, filterConfigurations } = state;
  // Collect all encoding-channel fields (mirrors collectAllFields in useTableRowsQuery)
  const allFields = useMemo(() => {
    const seen = new Set<string>();
    const result: Field[] = [];
    const add = (f: Field) => {
      const key = getResultColumnName(f);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(f);
      }
    };
    xAxisFields.forEach(add);
    yAxisFields.forEach(add);
    if (colorField) add(colorField);
    if (sizeField) add(sizeField);
    labelFields.forEach(add);
    tooltipFields.forEach(add);
    return result;
  }, [xAxisFields, yAxisFields, colorField, sizeField, labelFields, tooltipFields]);

  const handleTableCellFilterAction = useCallback(
    ({ action, columnName, values }: TableCellFilterAction) => {
      // Resolve the source Field for this column
      const sourceField = allFields.find((f) => getResultColumnName(f) === columnName);
      if (!sourceField) return;

      recordAction(getUndoableSnapshot());

      // Check for existing filter on this column
      const existingFilter = filterFields.find(
        (f) => f.columnName === sourceField.columnName,
      );

      if (action === 'keep') {
        // "Keep only" – selectedValues = the clicked values
        if (existingFilter && filterConfigurations[existingFilter.id]?.type === 'discrete') {
          updateExistingDiscreteFilter(
            existingFilter.id,
            existingFilter.columnName,
            values,
            dispatch,
            existingFilter.dateTimePart,
            existingFilter.dateTimeMode,
          );
        } else {
          addFieldAsDiscreteFilter(sourceField, values, filterFields, dispatch);
        }
      } else {
        // "Exclude" – store excludedValues so the query builder uses NOT IN.
        // We create/update a filter config directly with excludedValues set.
        if (existingFilter && filterConfigurations[existingFilter.id]?.type === 'discrete') {
          const current = filterConfigurations[existingFilter.id] as DiscreteFilterConfig;
          // Merge: accumulate excluded values
          const prevExcluded = current.excludedValues ?? [];
          const newExcluded = Array.from(
            new Set([...prevExcluded, ...values].map((v) => (v === null || v === undefined ? null : v))),
          );
          // Remove newly excluded from selectedValues
          const excludeSet = new Set(newExcluded.map(String));
          const newSelected = current.selectedValues.filter(
            (v) => !excludeSet.has(String(v)),
          );

          const config: DiscreteFilterConfig = {
            fieldId: existingFilter.id,
            columnName: existingFilter.columnName,
            type: 'discrete',
            selectedValues: newSelected,
            excludedValues: newExcluded,
            totalAvailableCount: current.totalAvailableCount,
            dateTimePart: existingFilter.dateTimePart,
            dateTimeMode: existingFilter.dateTimeMode,
          };
          dispatch({
            type: 'SET_FILTER_CONFIGURATION',
            payload: { fieldId: existingFilter.id, config },
          });
          dispatch({ type: 'APPLY_FILTERS' });
        } else {
          // No existing filter – create one with excludedValues.
          // selectedValues is empty (meaning "all except excluded")
          // but the query builder uses NOT IN when excludedValues is present.
          // However, addFieldAsDiscreteFilter always creates with selectedValues.
          // We create the field, then immediately overwrite the config.
          const newField = addFieldAsDiscreteFilter(sourceField, [], filterFields, dispatch);

          const config: DiscreteFilterConfig = {
            fieldId: newField.id,
            columnName: newField.columnName,
            type: 'discrete',
            selectedValues: [],
            excludedValues: values,
            dateTimePart: sourceField.dateTimePart,
            dateTimeMode: sourceField.dateTimeMode,
          };
          dispatch({
            type: 'SET_FILTER_CONFIGURATION',
            payload: { fieldId: newField.id, config },
          });
          dispatch({ type: 'APPLY_FILTERS' });
        }
      }
    },
    [allFields, filterFields, filterConfigurations, dispatch, recordAction, getUndoableSnapshot],
  );

  return { handleTableCellFilterAction };
}
