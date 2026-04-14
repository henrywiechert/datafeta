/**
 * useFilterActions – handles legend-filter and tooltip-filter interactions.
 *
 * Encapsulates:
 *  • Legend "Keep only" / "Exclude" from discrete colour legend
 *  • Tooltip-initiated keep / exclude (with datetime-part normalisation)
 *  • Injection of the tooltip callback into the chart spec
 */

import { useCallback, useMemo } from 'react';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import { toDatePartInteger } from '../utils/dateTimeConversion';
import { addFieldAsDiscreteFilter, updateExistingDiscreteFilter } from '../../../../utils/filterActions';
import { getResultColumnName } from '../../../../utils/fieldUtils';
import type { DateTimePart } from '../../../../types';
import type { LegendFilterAction } from '../../Legend/LegendPanel';

interface UseFilterActionsProps {
  recordAction: (snapshot: any) => void;
  getUndoableSnapshot: () => any;
  /** Chart spec produced by useChartGeneration – used for tooltip callback injection. */
  spec: any;
}

export function useFilterActions({
  recordAction,
  getUndoableSnapshot,
  spec,
}: UseFilterActionsProps) {
  const { state, dispatch } = useVisualizationContext();
  const { colorField, filterFields, filterConfigurations, queryResult } = state;
  const shapeField = (state as any).shapeField ?? null;
  // ── Legend → Filter bridge ───────────────────────────────────────────
  const handleLegendFilterAction = useCallback(
    (action: LegendFilterAction, values: any[], allDomainValues: any[]) => {
      if (!colorField) return;

      // Record undo snapshot before mutating filter state
      recordAction(getUndoableSnapshot());

      // Determine which values the filter should keep
      const keepValues =
        action === 'keep'
          ? values
          : allDomainValues.filter(v => {
              const valStr = String(v);
              return !values.some(sv => String(sv) === valStr);
            });

      // Check if a filter already exists for this column
      const existingFilter = filterFields.find(
        (f: any) => f.columnName === colorField.columnName,
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
      } else {
        addFieldAsDiscreteFilter(
          colorField,
          keepValues,
          filterFields,
          dispatch,
        );
      }
    },
    [colorField, filterFields, filterConfigurations, dispatch, recordAction, getUndoableSnapshot],
  );

  // ── Shape Legend → Filter bridge ─────────────────────────────────────
  const handleShapeLegendFilterAction = useCallback(
    (action: LegendFilterAction, values: any[], allDomainValues: any[]) => {
      if (!shapeField) return;

      recordAction(getUndoableSnapshot());

      const keepValues =
        action === 'keep'
          ? values
          : allDomainValues.filter(v => {
              const valStr = String(v);
              return !values.some(sv => String(sv) === valStr);
            });

      const existingFilter = filterFields.find(
        (f: any) => f.columnName === shapeField.columnName,
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
      } else {
        addFieldAsDiscreteFilter(
          shapeField,
          keepValues,
          filterFields,
          dispatch,
        );
      }
    },
    [shapeField, filterFields, filterConfigurations, dispatch, recordAction, getUndoableSnapshot],
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

  // ── Inject tooltip filter callback into each plot ────────────────────
  const specWithTooltipAction = useMemo(() => {
    if (!spec?.plots) return spec;
    return {
      ...spec,
      plots: spec.plots.map((p: any) => {
        const ct = p.options?.__customTooltip;
        if (!ct?.enabled) return p;
        return {
          ...p,
          options: {
            ...p.options,
            __customTooltip: { ...ct, onFilterAction: handleTooltipFilterAction },
          },
        };
      }),
    };
  }, [spec, handleTooltipFilterAction]);

  return { handleLegendFilterAction, handleShapeLegendFilterAction, specWithTooltipAction };
}
