/**
 * useRenderingTracking – manages the rendering batch lifecycle that
 * coordinates multi-plot render completion with the loading indicator.
 *
 * Uses `useLayoutEffect` (not `useEffect`) so the batch is set up
 * synchronously *before* child ObservablePlot rendering effects fire.
 */

import { useCallback, useLayoutEffect } from 'react';
import type { LoadingOperationType } from '../../../../contexts/VisualizationContext/types';

interface UseRenderingTrackingProps {
  spec: any;
  useTableView: boolean;
  renderingCoordinator: {
    cancelRenderingBatch: () => void;
    startRenderingBatch: (plotIds: string[], onComplete: () => void) => void;
    markPlotRendered: (plotId: string) => void;
  };
  completeOperation: (op: LoadingOperationType) => void;
  isLoadingRendering: boolean;
}

export function useRenderingTracking({
  spec,
  useTableView,
  renderingCoordinator,
  completeOperation,
  isLoadingRendering,
}: UseRenderingTrackingProps) {
  useLayoutEffect(() => {
    if (useTableView) {
      // In table view no chart rendering happens – cancel any pending batch
      renderingCoordinator.cancelRenderingBatch();
      return;
    }

    if (spec && spec.plots && spec.plots.length > 0) {
      const plotIds = spec.plots.map((plot: any) => plot.id);

      if (process.env.NODE_ENV === 'development') {
        console.log('[ChartArea] Setting up rendering batch for', plotIds.length, 'plots');
      }

      renderingCoordinator.startRenderingBatch(plotIds, () => {
        if (isLoadingRendering) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ChartArea] All plots rendered, completing rendering operation');
          }
          completeOperation('rendering');
        }
      });
    } else if (spec !== null && isLoadingRendering) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChartArea] Spec has no plots, completing rendering immediately');
      }
      completeOperation('rendering');
    }
  }, [spec, useTableView, renderingCoordinator, completeOperation, isLoadingRendering]);

  const handlePlotRenderComplete = useCallback(
    (plotId: string) => {
      renderingCoordinator.markPlotRendered(plotId);
    },
    [renderingCoordinator],
  );

  return { handlePlotRenderComplete };
}
