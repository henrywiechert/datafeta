// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useRenderingTracking – manages the rendering batch lifecycle that
 * coordinates multi-plot render completion with the loading indicator.
 *
 * Uses `useLayoutEffect` (not `useEffect`) so the batch is set up
 * synchronously *before* child ObservablePlot rendering effects fire.
 */

import { useCallback, useLayoutEffect } from 'react';
import type { LoadingOperationType } from '../../../../contexts/VisualizationContext/types';
import type { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import { devLog } from '../../../../utils/devLog';

interface UseRenderingTrackingProps {
  grid: GridResultModel | null;
  useTableView: boolean;
  showTableRows?: boolean;
  renderingCoordinator: {
    cancelRenderingBatch: () => void;
    startRenderingBatch: (plotIds: string[], onComplete: () => void) => void;
    markPlotRendered: (plotId: string) => void;
  };
  completeOperation: (op: LoadingOperationType) => void;
  isLoadingRendering: boolean;
}

export function useRenderingTracking({
  grid,
  useTableView,
  showTableRows = false,
  renderingCoordinator,
  completeOperation,
  isLoadingRendering,
}: UseRenderingTrackingProps) {
  useLayoutEffect(() => {
    if (showTableRows) {
      // In the raw-rows view no chart rendering happens – cancel any pending
      // batch. (Table-presentation chart types such as `table-refactor` DO
      // produce a grid of synchronous text/symbol cells and are handled by the
      // "no renderable cells" branch below, so they must NOT early-return here
      // or the rendering operation would never complete.)
      renderingCoordinator.cancelRenderingBatch();
      return;
    }

    // Only plot/pie cells render asynchronously and report completion via
    // `onPlotRenderComplete`; text/mark/empty cells render synchronously and
    // must not be tracked or the batch would never complete.
    const renderableIds = grid?.cells
      ?.filter((cell) => cell.content.kind === 'plot' || cell.content.kind === 'pie')
      .map((cell) => cell.id) ?? [];

    if (renderableIds.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        devLog('[ChartArea] Setting up rendering batch for', renderableIds.length, 'cells');
      }

      renderingCoordinator.startRenderingBatch(renderableIds, () => {
        if (isLoadingRendering) {
          if (process.env.NODE_ENV === 'development') {
            devLog('[ChartArea] All cells rendered, completing rendering operation');
          }
          completeOperation('rendering');
        }
      });
    } else if (grid !== null && isLoadingRendering) {
      if (process.env.NODE_ENV === 'development') {
        devLog('[ChartArea] Grid has no renderable cells, completing rendering immediately');
      }
      completeOperation('rendering');
    }
  }, [grid, useTableView, showTableRows, renderingCoordinator, completeOperation, isLoadingRendering]);

  const handlePlotRenderComplete = useCallback(
    (plotId: string) => {
      renderingCoordinator.markPlotRendered(plotId);
    },
    [renderingCoordinator],
  );

  return { handlePlotRenderComplete };
}
