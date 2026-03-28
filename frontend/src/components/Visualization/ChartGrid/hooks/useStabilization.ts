import { useState, useEffect, useRef, MutableRefObject, RefObject } from 'react';
import { PlotResult } from '../../../../observable-plot-generator/types';

export interface StabilizationState {
  isStabilizing: boolean;
  pendingRowHeightRef: MutableRefObject<number | null>;
}

/**
 * Hook for stabilizing renders during spec changes
 * Prevents ResizeObservers from triggering intermediate renders
 * when faceting changes (e.g., 30 rows → 3 rows)
 */
export function useStabilization(
  spec: PlotResult | null,
  containerRef: RefObject<HTMLDivElement>
): StabilizationState {
  const [isStabilizing, setIsStabilizing] = useState(false);
  const stabilizationTimeoutRef = useRef<number | null>(null);
  const pendingRowHeightRef = useRef<number | null>(null);
  // Track whether we've rendered a spec before — skip stabilization on the
  // very first spec to avoid blocking the initial row-height calculation.
  const hasRenderedSpecRef = useRef(false);

  // Stabilization effect: Freeze dimension updates briefly when spec changes
  useEffect(() => {
    // On the initial transition from no-spec to spec, skip stabilization.
    // There's no previous chart to protect from flicker, and blocking the
    // first height calculation causes the chart to render at MIN_GRID_ROW_PX.
    if (!hasRenderedSpecRef.current) {
      hasRenderedSpecRef.current = true;
      return;
    }

    // Clear any existing stabilization timeout
    if (stabilizationTimeoutRef.current !== null) {
      clearTimeout(stabilizationTimeoutRef.current);
    }

    // Clear any pending row height from previous stabilization
    pendingRowHeightRef.current = null;

    // Freeze updates
    setIsStabilizing(true);

    if (process.env.NODE_ENV === 'development') {
      console.log('[ChartGrid] Stabilizing: freezing dimension updates for 300ms');
    }

    // Unfreeze after layout has settled (300ms should cover browser layout + paint + debouncing)
    stabilizationTimeoutRef.current = window.setTimeout(() => {
      setIsStabilizing(false);
      stabilizationTimeoutRef.current = null;

      // Pending rowHeight updates are handled in useRowHeightCalculation
      if (process.env.NODE_ENV === 'development' && pendingRowHeightRef.current !== null) {
        console.log('[ChartGrid] Stabilization complete, pending height:', pendingRowHeightRef.current);
      }
    }, 300);

    return () => {
      if (stabilizationTimeoutRef.current !== null) {
        clearTimeout(stabilizationTimeoutRef.current);
      }
    };
  }, [spec?.plots?.length, spec?.layout?.columns, spec?.layout?.rows]);

  // Sync stabilization flag to DOM for closure access in ResizeObserver callbacks
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as any).__isStabilizing = isStabilizing;
    }
  }, [isStabilizing, containerRef]);

  return {
    isStabilizing,
    pendingRowHeightRef,
  };
}
