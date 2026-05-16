// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useFilterActions – handles legend-filter and tooltip-filter interactions.
 *
 * Encapsulates:
 *  • Legend "Keep only" / "Exclude" from discrete colour legend
 *  • Tooltip-initiated keep / exclude (with datetime-part normalisation)
 *  • Injection of the tooltip callback into the chart grid
 */

import { useCallback, useMemo } from 'react';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import { toDatePartInteger } from '../utils/dateTimeConversion';
import { addFieldAsDiscreteFilter, updateExistingDiscreteFilter } from '../../../../utils/filterActions';
import { getResultColumnName } from '../../../../utils/fieldUtils';
import type { DateTimePart, Field } from '../../../../types';
import type { LegendFilterAction } from '../../Legend/LegendPanel';
import type { GridResultModel } from '../../../../observable-plot-generator/gridModel';

interface UseFilterActionsProps {
  recordAction: (snapshot: any) => void;
  getUndoableSnapshot: () => any;
  /** Chart grid produced by useChartGeneration – used for tooltip callback injection. */
  grid: GridResultModel | null;
}

export function useFilterActions({
  recordAction,
  getUndoableSnapshot,
  grid,
}: UseFilterActionsProps) {
  const { state, dispatch } = useVisualizationContext();
  const { colorField, filterFields, filterConfigurations, queryResult, shapeField } = state;

  const applyDiscreteLegendFilterAction = useCallback(
    (field: Field | null, action: LegendFilterAction, values: any[], allDomainValues: any[]) => {
      if (!field) return;

      recordAction(getUndoableSnapshot());

      const keepValues =
        action === 'keep'
          ? values
          : allDomainValues.filter(v => {
              const valStr = String(v);
              return !values.some(sv => String(sv) === valStr);
            });

      const existingFilter = filterFields.find(
        (filterField: Field) => filterField.columnName === field.columnName,
      );

      if (
        existingFilter &&
        filterConfigurations[existingFilter.id]?.type === 'discrete'
      ) {
        updateExistingDiscreteFilter(
          existingFilter.id,
          existingFilter.columnName,
          keepValues,
          dispatch,
          existingFilter.dateTimePart,
          existingFilter.dateTimeMode,
        );
        return;
      }

      addFieldAsDiscreteFilter(
        field,
        keepValues,
        filterFields,
        dispatch,
      );
    },
    [filterFields, filterConfigurations, dispatch, recordAction, getUndoableSnapshot],
  );

  // ── Legend → Filter bridge ───────────────────────────────────────────
  const handleLegendFilterAction = useCallback(
    (action: LegendFilterAction, values: any[], allDomainValues: any[]) => {
      applyDiscreteLegendFilterAction(colorField, action, values, allDomainValues);
    },
    [applyDiscreteLegendFilterAction, colorField],
  );

  // ── Shape Legend → Filter bridge ─────────────────────────────────────
  const handleShapeLegendFilterAction = useCallback(
    (action: LegendFilterAction, values: any[], allDomainValues: any[]) => {
      applyDiscreteLegendFilterAction(shapeField, action, values, allDomainValues);
    },
    [applyDiscreteLegendFilterAction, shapeField],
  );

  // ── Tooltip → Filter bridge ──────────────────────────────────────────
  const handleTooltipFilterAction = useCallback(
    (action: 'keep' | 'exclude' | 'filter-visible', field: import('../../../../types').TooltipField) => {
      const sourceField = field.sourceField;
      if (!sourceField) return;
      // 'keep' and 'exclude' require a concrete rawValue; 'filter-visible' does not
      if (action !== 'filter-visible' && field.rawValue == null) return;

      recordAction(getUndoableSnapshot());

      const existingFilter = filterFields.find(
        (f: any) => f.columnName === sourceField.columnName,
      );
      const filterDateTimePart: DateTimePart | undefined =
        existingFilter?.dateTimePart ?? sourceField.dateTimePart;
      const filterDateTimeMode =
        existingFilter?.dateTimeMode ?? sourceField.dateTimeMode;

      const needsPartExtraction = !!filterDateTimePart;
      const effectiveDateTimeMode = needsPartExtraction
        ? ('distinct' as const)
        : filterDateTimeMode;

      /** Normalise a single value if datetime extraction is required. */
      const normalise = (v: any): any =>
        needsPartExtraction ? toDatePartInteger(v, filterDateTimePart!) : v;

      let keepValues: any[];

      if (action === 'filter-visible') {
        const resultColName = getResultColumnName(sourceField);
        keepValues = queryResult?.rows
          ? Array.from(
              new Set(queryResult.rows.map((row: any) => normalise(row[resultColName]))),
            )
          : [];
      } else if (action === 'keep') {
        keepValues = [normalise(field.rawValue)];
      } else {
        const resultColName = getResultColumnName(sourceField);
        const allValues = queryResult?.rows
          ? Array.from(
              new Set(queryResult.rows.map((row: any) => normalise(row[resultColName]))),
            )
          : [];
        const excludeStr = String(normalise(field.rawValue));
        keepValues = allValues.filter(v => String(v) !== excludeStr);
      }

      if (
        existingFilter &&
        filterConfigurations[existingFilter.id]?.type === 'discrete'
      ) {
        updateExistingDiscreteFilter(
          existingFilter.id,
          existingFilter.columnName,
          keepValues,
          dispatch,
          filterDateTimePart,
          effectiveDateTimeMode,
        );
      } else {
        const fieldForFilter = needsPartExtraction
          ? { ...sourceField, dateTimeMode: 'distinct' as const }
          : sourceField;
        addFieldAsDiscreteFilter(
          fieldForFilter,
          keepValues,
          filterFields,
          dispatch,
        );
      }
    },
    [queryResult, filterFields, filterConfigurations, dispatch, recordAction, getUndoableSnapshot],
  );

  // ── Inject tooltip filter callback into each cell ────────────────────
  // For plot cells the callback lives on `options.__customTooltip`; for pie
  // cells it lives on the cell's `tooltipConfig`. Cells without a custom
  // tooltip enabled are returned unchanged so memoization downstream stays
  // stable.
  const gridWithTooltipAction = useMemo<GridResultModel | null>(() => {
    if (!grid) return grid;
    let mutated = false;
    const cells = grid.cells.map((cell) => {
      if (cell.content.kind === 'plot') {
        const ct = (cell.content.options as any)?.__customTooltip;
        if (!ct?.enabled) return cell;
        mutated = true;
        return {
          ...cell,
          content: {
            ...cell.content,
            options: {
              ...cell.content.options,
              __customTooltip: { ...ct, onFilterAction: handleTooltipFilterAction },
            } as any,
          },
        };
      }
      if (cell.content.kind === 'pie') {
        const ct = cell.content.tooltipConfig;
        if (!ct?.enabled) return cell;
        mutated = true;
        return {
          ...cell,
          content: {
            ...cell.content,
            tooltipConfig: { ...ct, onFilterAction: handleTooltipFilterAction },
          },
        };
      }
      return cell;
    });
    return mutated ? { ...grid, cells } : grid;
  }, [grid, handleTooltipFilterAction]);

  return { handleLegendFilterAction, handleShapeLegendFilterAction, gridWithTooltipAction };
}
