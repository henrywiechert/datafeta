// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Owns the chart area's ViewportController (transient pan/zoom state, see
 * viewportController.ts), keeps it free of columns that left the axes, and
 * exposes whether any viewport is active (for the zoom reset controls).
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Field } from '../../../../types';
import { getResultColumnName } from '../../../../utils/fieldUtils';
import {
  createViewportController,
  type ViewportController,
} from '../../ChartGrid/viewport/viewportController';

interface UseViewportControllerParams {
  xAxisFields: Field[];
  yAxisFields: Field[];
}

export function useViewportController({
  xAxisFields,
  yAxisFields,
}: UseViewportControllerParams): { controller: ViewportController; hasViewport: boolean } {
  const controller = useMemo(() => createViewportController(), []);

  useEffect(() => () => controller.dispose(), [controller]);

  // Drop entries for columns that are no longer plotted, so re-adding a field
  // later starts from its natural domain.
  useEffect(() => {
    const plotted = new Set(
      [...xAxisFields, ...yAxisFields].flatMap((f) => [
        f.columnName,
        getResultColumnName(f),
        // Measures plot under their aggregate alias, SUM by default.
        ...(f.type === 'measure' ? [getResultColumnName({ ...f, aggregation: f.aggregation || 'sum' } as Field)] : []),
      ])
    );
    const stale = Object.keys(controller.getCommitted()).filter((column) => !plotted.has(column));
    if (stale.length > 0) controller.clear(stale);
  }, [controller, xAxisFields, yAxisFields]);

  const hasViewport = useSyncExternalStore(
    controller.subscribeCommitted,
    () => Object.keys(controller.getCommitted()).length > 0,
  );

  return { controller, hasViewport };
}
