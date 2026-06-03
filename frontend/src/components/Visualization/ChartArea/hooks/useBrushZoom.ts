// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useMemo } from 'react';
import { Field, FilterConfig, FilterMetadata } from '../../../../types';
import { VisualizationAction } from '../../../../contexts/VisualizationContext';
import { PlotBrushEvent } from '../../ChartGrid/PlotArea';
import {
  invertQuantitative,
  invertBand,
  isBandScale,
  isTemporalScale,
  ScaleDescriptor,
} from '../../../../utils/scaleInversion';
import {
  addFieldAsContinuousFilter,
  updateExistingContinuousFilter,
  addFieldAsDiscreteZoomFilter,
  updateExistingDiscreteFilter,
  addFieldAsDateTimeZoomFilter,
  updateExistingDateTimeFilter,
  Dispatch,
} from '../../../../utils/filterActions';
import { formatISODateTime } from '../../../../datetime/datetimeFormatUtils';

/**
 * Format epoch ms to a filter-friendly ISO string using UTC components.
 *
 * The chart scale (type: 'utc') displays UTC hours. We must produce
 * literal digits that match exactly, then append 'Z' so ClickHouse's
 * parseDateTime64BestEffort interprets them as UTC.  Using Date.toISOString()
 * achieves the same result in the UTC-only path but breaks when the epoch
 * was silently shifted (e.g. by a non-UTC DuckDB WASM session).  Building
 * the string from explicit UTC getters makes intent clear and avoids
 * accidental double-conversion.
 */
function epochMsToFilterISO(ms: number): string {
  const d = new Date(ms);
  return formatISODateTime({
    date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`,
    milliseconds: String(d.getUTCMilliseconds()).padStart(3, '0'),
  });
}

/**
 * Parse a filter ISO string (with Z suffix) back to epoch ms,
 * treating the literal digits as UTC — matching how epochMsToFilterISO
 * produced them.
 */
function filterISOToEpochMs(iso: string): number {
  return new Date(iso).getTime();
}

/** Distinct datetime axes use integer parts (year, month, …); snap brush range. */
function normalizeDistinctBrushRange(
  field: Field,
  min: number,
  max: number,
): { min: number; max: number } {
  if (field.dateTimeMode === 'distinct' && field.dateTimePart) {
    return { min: Math.floor(min), max: Math.ceil(max) };
  }
  return { min, max };
}

interface UseBrushZoomParams {
  dispatch: Dispatch;
  filterFields: Field[];
  appliedFilterConfigurations: Record<string, FilterConfig>;
  filterMetadata: Record<string, FilterMetadata>;
  recordAction: (snapshot: any) => void;
  getUndoableSnapshot: () => any;
  independentDomains?: { x?: boolean; y?: boolean };
}

/**
 * Orchestrates chart brush → filter creation/update and zoom-out logic.
 */
export function useBrushZoom({
  dispatch,
  filterFields,
  appliedFilterConfigurations,
  filterMetadata,
  recordAction,
  getUndoableSnapshot,
  independentDomains,
}: UseBrushZoomParams) {
  const brushDisabled = !!(independentDomains?.x || independentDomains?.y);

  const findExistingZoomFilter = useCallback(
    (columnName: string): { fieldId: string; config: FilterConfig } | null => {
      for (const [fieldId, cfg] of Object.entries(appliedFilterConfigurations)) {
        if (cfg.columnName === columnName && cfg.isZoomFilter) {
          return { fieldId, config: cfg };
        }
      }
      return null;
    },
    [appliedFilterConfigurations],
  );

  const handleBrushEnd = useCallback(
    (event: PlotBrushEvent) => {
      const { brush, plotElement, xField, yField } = event;
      console.debug('[BrushZoom] handleBrushEnd', { axis: brush.axis, startPx: brush.startPx, endPx: brush.endPx, hasPlotEl: !!plotElement, xField: xField?.columnName, yField: yField?.columnName });
      const field = brush.axis === 'x' ? xField : yField;
      if (!field) { console.debug('[BrushZoom] no field for axis', brush.axis); return; }

      const scaleFn = (plotElement as any).scale;
      if (!scaleFn) { console.debug('[BrushZoom] no scale fn on plot element'); return; }
      const scale: ScaleDescriptor | undefined = scaleFn(brush.axis);
      console.debug('[BrushZoom] scale', brush.axis, scale);
      if (!scale || !scale.domain || !scale.range) { console.debug('[BrushZoom] scale missing domain/range'); return; }

      recordAction(getUndoableSnapshot());

      if (isBandScale(scale)) {
        const selectedValues = invertBand(brush.startPx, brush.endPx, scale);
        if (selectedValues.length === 0) return;

        const existing = findExistingZoomFilter(field.columnName);
        if (existing) {
          updateExistingDiscreteFilter(
            existing.fieldId,
            field.columnName,
            selectedValues,
            dispatch as React.Dispatch<VisualizationAction>,
            field.dateTimePart,
            field.dateTimeMode,
          );
        } else {
          addFieldAsDiscreteZoomFilter(
            field,
            selectedValues,
            filterFields,
            dispatch as React.Dispatch<VisualizationAction>,
          );
        }
      } else if (isTemporalScale(scale)) {
        const v1 = invertQuantitative(brush.startPx, scale);
        const v2 = invertQuantitative(brush.endPx, scale);
        const minMs = Math.min(v1, v2);
        const maxMs = Math.max(v1, v2);
        if (maxMs - minMs <= 0) return;

        const startDate = epochMsToFilterISO(minMs);
        const endDate = epochMsToFilterISO(maxMs);

        const existing = findExistingZoomFilter(field.columnName);
        if (existing) {
          updateExistingDateTimeFilter(
            existing.fieldId,
            field.columnName,
            startDate,
            endDate,
            dispatch as React.Dispatch<VisualizationAction>,
          );
        } else {
          addFieldAsDateTimeZoomFilter(
            field,
            startDate,
            endDate,
            filterFields,
            dispatch as React.Dispatch<VisualizationAction>,
          );
        }
      } else {
        const v1 = invertQuantitative(brush.startPx, scale);
        const v2 = invertQuantitative(brush.endPx, scale);
        const { min, max } = normalizeDistinctBrushRange(
          field,
          Math.min(v1, v2),
          Math.max(v1, v2),
        );
        if (max - min <= 0) return;

        const existing = findExistingZoomFilter(field.columnName);
        if (existing) {
          updateExistingContinuousFilter(
            existing.fieldId,
            field.columnName,
            min,
            max,
            dispatch as React.Dispatch<VisualizationAction>,
            field.dateTimePart,
            field.dateTimeMode,
          );
        } else {
          addFieldAsContinuousFilter(
            field,
            min,
            max,
            filterFields,
            dispatch as React.Dispatch<VisualizationAction>,
          );
        }
      }
    },
    [dispatch, filterFields, findExistingZoomFilter, recordAction, getUndoableSnapshot],
  );

  const handleZoomOut = useCallback(() => {
    const zoomFilters = Object.entries(appliedFilterConfigurations).filter(
      ([, cfg]) => cfg.isZoomFilter,
    );
    if (zoomFilters.length === 0) return;

    recordAction(getUndoableSnapshot());

    for (const [fieldId, cfg] of zoomFilters) {
      if (cfg.type === 'continuous' && cfg.min != null && cfg.max != null) {
        const mid = (cfg.min + cfg.max) / 2;
        const halfSpan = (cfg.max - cfg.min) / 2;
        let newMin = mid - halfSpan * 2;
        let newMax = mid + halfSpan * 2;

        // Clamp to metadata bounds if available
        const meta = filterMetadata[fieldId];
        if (meta && meta.type === 'continuous') {
          newMin = Math.max(newMin, meta.min);
          newMax = Math.min(newMax, meta.max);
        }

        updateExistingContinuousFilter(
          fieldId,
          cfg.columnName,
          newMin,
          newMax,
          dispatch as React.Dispatch<VisualizationAction>,
          cfg.dateTimePart,
          cfg.dateTimeMode,
        );
      } else if (cfg.type === 'datetime' && cfg.startDate != null && cfg.endDate != null) {
        const startMs = filterISOToEpochMs(cfg.startDate);
        const endMs = filterISOToEpochMs(cfg.endDate);
        const mid = (startMs + endMs) / 2;
        const halfSpan = (endMs - startMs) / 2;
        let newStartMs = mid - halfSpan * 2;
        let newEndMs = mid + halfSpan * 2;

        const meta = filterMetadata[fieldId];
        if (meta && meta.type === 'datetime') {
          const metaMinMs = filterISOToEpochMs(meta.min);
          const metaMaxMs = filterISOToEpochMs(meta.max);
          newStartMs = Math.max(newStartMs, metaMinMs);
          newEndMs = Math.min(newEndMs, metaMaxMs);
        }

        updateExistingDateTimeFilter(
          fieldId,
          cfg.columnName,
          epochMsToFilterISO(newStartMs),
          epochMsToFilterISO(newEndMs),
          dispatch as React.Dispatch<VisualizationAction>,
        );
      } else if (cfg.type === 'discrete') {
        const meta = filterMetadata[fieldId];
        if (!meta || meta.type !== 'discrete') continue;
        const allValues: any[] = meta.availableValues;
        const currentSet = new Set(cfg.selectedValues.map(String));

        // Find index range of currently selected values in the ordered domain
        let minIdx = allValues.length;
        let maxIdx = -1;
        for (let i = 0; i < allValues.length; i++) {
          if (currentSet.has(String(allValues[i]))) {
            if (i < minIdx) minIdx = i;
            if (i > maxIdx) maxIdx = i;
          }
        }
        if (maxIdx < 0) continue;

        // Expand by the same count on each side (2x total span)
        const span = maxIdx - minIdx + 1;
        const expand = Math.max(1, Math.floor(span / 2));
        const newMinIdx = Math.max(0, minIdx - expand);
        const newMaxIdx = Math.min(allValues.length - 1, maxIdx + expand);
        const newValues = allValues.slice(newMinIdx, newMaxIdx + 1);

        updateExistingDiscreteFilter(
          fieldId,
          cfg.columnName,
          newValues,
          dispatch as React.Dispatch<VisualizationAction>,
        );
      }
    }
  }, [appliedFilterConfigurations, filterMetadata, dispatch, recordAction, getUndoableSnapshot]);

  const handleZoomReset = useCallback(() => {
    const zoomFieldIds = Object.entries(appliedFilterConfigurations)
      .filter(([, cfg]) => cfg.isZoomFilter)
      .map(([fieldId]) => fieldId);
    if (zoomFieldIds.length === 0) return;

    recordAction(getUndoableSnapshot());

    const remainingFields = filterFields.filter((f) => !zoomFieldIds.includes(f.id));
    dispatch({ type: 'SET_FILTER_FIELDS', payload: remainingFields } as VisualizationAction);
    for (const fieldId of zoomFieldIds) {
      dispatch({ type: 'REMOVE_FILTER_CONFIGURATION', payload: fieldId } as VisualizationAction);
    }
  }, [appliedFilterConfigurations, filterFields, dispatch, recordAction, getUndoableSnapshot]);

  const hasActiveZoomFilters = useMemo(
    () => Object.values(appliedFilterConfigurations).some((cfg) => cfg.isZoomFilter),
    [appliedFilterConfigurations],
  );

  return {
    brushDisabled,
    handleBrushEnd,
    handleZoomOut,
    handleZoomReset,
    hasActiveZoomFilters,
  };
}
