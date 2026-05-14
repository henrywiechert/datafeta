// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useState, useEffect, RefObject, MutableRefObject } from 'react';
import { MIN_GRID_ROW_PX } from '../../../../config/chartLayoutConfig';

/**
 * Hook for calculating and maintaining row height based on container size
 * Uses ResizeObserver with debouncing to handle dynamic resizing
 */
export function useRowHeightCalculation(
  vScrollRef: RefObject<HTMLDivElement>,
  rowsForSizing: number,
  containerRef: RefObject<HTMLDivElement>,
  pendingRowHeightRef: MutableRefObject<number | null>,
  isStabilizing: boolean
): number {
  const [rowHeightPx, setRowHeightPx] = useState<number>(MIN_GRID_ROW_PX);

  useEffect(() => {
    let rafId = 0;
    let updateRafId: number | null = null;
    let debounceTimeoutId: number | null = null;
    let isUpdateScheduled = false;
    let ro: ResizeObserver | null = null;

    const updateRowHeight = () => {
      const scroller = vScrollRef.current;
      if (!scroller) return;

      const available = scroller.clientHeight;
      const r = Math.max(1, rowsForSizing);
      if (available > 0) {
        const h = Math.max(MIN_GRID_ROW_PX, Math.floor(available / r));

        // CRITICAL: During stabilization, store pending height instead of updating state
        // This prevents intermediate renders when faceting changes
        const container = containerRef.current;
        if (container && (container as any).__isStabilizing) {
          pendingRowHeightRef.current = h;
          isUpdateScheduled = false;
          if (process.env.NODE_ENV === 'development') {
            console.log('[ChartGrid] Deferring rowHeight update during stabilization:', h);
          }
          return;
        }

        // Not stabilizing: apply immediately
        setRowHeightPx((prev) => {
          // Only update if actually changed to avoid unnecessary renders
          if (prev !== h && process.env.NODE_ENV === 'development') {
            console.log('[ChartGrid] Updating rowHeight:', prev, '→', h);
          }
          return prev === h ? prev : h;
        });
      }
      isUpdateScheduled = false;
    };

    // Debounce + RAF throttling: Wait for layout to settle before recalculating
    // This prevents intermediate renders during faceting changes
    const scheduleUpdate = () => {
      if (!isUpdateScheduled) {
        isUpdateScheduled = true;

        // Clear any pending debounce
        if (debounceTimeoutId !== null) {
          clearTimeout(debounceTimeoutId);
        }

        // Debounce: Wait 250ms for layout to settle, then schedule RAF update
        // Longer delay ensures all DOM mutations and faceting changes have completed
        debounceTimeoutId = window.setTimeout(() => {
          updateRafId = requestAnimationFrame(updateRowHeight);
          debounceTimeoutId = null;
        }, 250);
      }
    };

    const attachWhenReady = () => {
      if (!vScrollRef.current) {
        rafId = window.requestAnimationFrame(attachWhenReady);
        return;
      }
      // CRITICAL: Initial compute should happen immediately on first render
      // This ensures the chart is sized correctly when first measure is dropped
      // Use RAF but skip debounce for initial calculation
      updateRafId = requestAnimationFrame(updateRowHeight);
      
      // Observe size changes of the scroller with debounced RAF throttling
      ro = new ResizeObserver(scheduleUpdate);
      ro.observe(vScrollRef.current as Element);
      // Also respond to window resizes with debouncing
      window.addEventListener('resize', scheduleUpdate);
    };

    attachWhenReady();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (updateRafId !== null) window.cancelAnimationFrame(updateRafId);
      if (debounceTimeoutId !== null) clearTimeout(debounceTimeoutId);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [rowsForSizing, vScrollRef, containerRef, pendingRowHeightRef]); // Only rowsForSizing, not spec - avoids teardown on every spec change

  // Apply any pending height updates after stabilization completes.
  // Triggered by isStabilizing going from true → false.
  useEffect(() => {
    if (!isStabilizing && pendingRowHeightRef.current !== null) {
      const pendingHeight = pendingRowHeightRef.current;
      pendingRowHeightRef.current = null;
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChartGrid] Applying pending rowHeight after stabilization:', pendingHeight);
      }
      setRowHeightPx((prev) => (prev === pendingHeight ? prev : pendingHeight));
    }
  }, [isStabilizing, pendingRowHeightRef]);

  return rowHeightPx;
}
