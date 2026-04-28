import { useState, useEffect, useRef, MutableRefObject, RefObject } from 'react';
import { GridResultModel } from '../gridModel';

export interface StabilizationState {
  isStabilizing: boolean;
  pendingRowHeightRef: MutableRefObject<number | null>;
}

/**
 * Hook for stabilizing renders during grid changes
 * Prevents ResizeObservers from triggering intermediate renders
 * when faceting changes (e.g., 30 rows → 3 rows)
 */
export function useStabilization(
  grid: GridResultModel | null,
  containerRef: RefObject<HTMLDivElement>
): StabilizationState {
  const [isStabilizing, setIsStabilizing] = useState(false);
  const stabilizationTimeoutRef = useRef<number | null>(null);
  const pendingRowHeightRef = useRef<number | null>(null);
  // Track whether we've rendered a grid before — skip stabilization on the
  // very first grid to avoid blocking the initial row-height calculation.
  const hasRenderedGridRef = useRef(false);

  // Stabilization effect: Freeze dimension updates briefly when grid changes
  useEffect(() => {
    // On the initial transition from no-grid to grid, skip stabilization.
    // There's no previous chart to protect from flicker, and blocking the
    // first height calculation causes the chart to render at MIN_GRID_ROW_PX.
    if (!hasRenderedGridRef.current) {
      hasRenderedGridRef.current = true;
      return;
    }

    if (stabilizationTimeoutRef.current !== null) {
      clearTimeout(stabilizationTimeoutRef.current);
    }

    pendingRowHeightRef.current = null;

    setIsStabilizing(true);

    if (process.env.NODE_ENV === 'development') {
      console.log('[ChartGrid] Stabilizing: freezing dimension updates for 300ms');
    }

    // Unfreeze after layout has settled (300ms covers browser layout + paint + debouncing)
    stabilizationTimeoutRef.current = window.setTimeout(() => {
      setIsStabilizing(false);
      stabilizationTimeoutRef.current = null;

      if (process.env.NODE_ENV === 'development' && pendingRowHeightRef.current !== null) {
        console.log('[ChartGrid] Stabilization complete, pending height:', pendingRowHeightRef.current);
      }
    }, 300);

    return () => {
      if (stabilizationTimeoutRef.current !== null) {
        clearTimeout(stabilizationTimeoutRef.current);
      }
    };
  }, [grid?.cells.length, grid?.layout?.columns, grid?.layout?.rows]);

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
