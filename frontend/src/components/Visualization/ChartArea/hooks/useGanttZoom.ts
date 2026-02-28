/**
 * useGanttZoom – computes the full data range for Gantt charts and
 * provides the handler for zoom-range changes.
 */

import { useMemo, useCallback } from 'react';

interface UseGanttZoomProps {
  isGanttChart: boolean;
  queryResult: any;
  xAxisFields: any[];
  sizeField: any;
  dispatch: (action: any) => void;
}

export function useGanttZoom({
  isGanttChart,
  queryResult,
  xAxisFields,
  sizeField,
  dispatch,
}: UseGanttZoomProps) {
  // Compute full data range for Gantt chart zoom calculations.
  // Extracts min/max from the start field (first continuous dimension on X).
  const ganttFullDataRange = useMemo(() => {
    if (!isGanttChart || !queryResult?.rows?.length) {
      return null;
    }

    // Find the start field – continuous dimension on X axis
    const startField = xAxisFields.find(
      (f: any) => f.type === 'dimension' && f.flavour === 'continuous',
    );

    if (!startField) {
      return null;
    }

    const columnName = startField.columnName || startField.name;

    let min = Infinity;
    let max = -Infinity;

    // Also consider duration (size field) for computing max extent
    const durationColumn = sizeField?.columnName || sizeField?.name;

    for (const row of queryResult.rows) {
      const startValue = row[columnName];
      if (typeof startValue === 'number' && Number.isFinite(startValue)) {
        if (startValue < min) min = startValue;

        // Compute end value (start + duration) for max
        const duration = durationColumn ? row[durationColumn] : 0;
        const endValue =
          typeof duration === 'number' && Number.isFinite(duration) && duration > 0
            ? startValue + duration
            : startValue;

        if (endValue > max) max = endValue;
        if (startValue > max) max = startValue;
      }
    }

    if (min === Infinity || max === -Infinity) {
      return null;
    }

    // Add small padding (5%)
    const range = max - min;
    const padding = range * 0.05;

    return { min: min - padding, max: max + padding };
  }, [isGanttChart, queryResult, xAxisFields, sizeField]);

  const handleGanttZoomRangeChange = useCallback(
    (range: { min: number; max: number } | null) => {
      dispatch({ type: 'SET_GANTT_ZOOM_RANGE', payload: range });
    },
    [dispatch],
  );

  return { ganttFullDataRange, handleGanttZoomRangeChange };
}
