// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useRef, useCallback, useEffect, useMemo } from 'react';

/**
 * Hook to coordinate rendering operations and track when they're complete.
 * This ensures the loading modal is shown during actual DOM rendering, not just spec generation.
 * 
 * For faceted charts with many plots, we need to track when all plots have rendered.
 */
export function useRenderingCoordinator() {
  const pendingPlotsRef = useRef<Set<string>>(new Set());
  const renderingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onAllRenderedRef = useRef<(() => void) | null>(null);

  /**
   * Register a plot that needs to be rendered
   */
  const registerPlot = useCallback((plotId: string) => {
    pendingPlotsRef.current.add(plotId);
  }, []);

  /**
   * Mark a plot as rendered
   */
  const markPlotRendered = useCallback((plotId: string) => {
    pendingPlotsRef.current.delete(plotId);
    
    // Avoid per-plot logging: with large faceted grids this can freeze the UI.
    // Keep a lightweight signal only if needed for debugging.
    // if (process.env.NODE_ENV === 'development') { ... }
    
    // If all plots are rendered, call the completion callback
    if (pendingPlotsRef.current.size === 0 && onAllRenderedRef.current) {
      // Clear any pending timeout
      if (renderingTimeoutRef.current) {
        clearTimeout(renderingTimeoutRef.current);
        renderingTimeoutRef.current = null;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[RenderingCoordinator] All plots rendered, calling completion callback');
      }
      
      // Call completion callback
      const callback = onAllRenderedRef.current;
      onAllRenderedRef.current = null;
      callback();
    }
  }, []);

  /**
   * Start tracking a rendering batch with a callback for when all plots are rendered
   * @param plotIds - Array of plot IDs that will be rendered
   * @param onAllRendered - Callback to execute when all plots are rendered
   * @param timeout - Maximum time to wait before forcing completion (default: 30s)
   */
  const startRenderingBatch = useCallback((
    plotIds: string[],
    onAllRendered: () => void,
    timeout: number = 30000
  ) => {
    // Clear any previous batch
    pendingPlotsRef.current.clear();
    if (renderingTimeoutRef.current) {
      clearTimeout(renderingTimeoutRef.current);
    }

    if (process.env.NODE_ENV === 'development') {
      // Avoid logging 1000+ IDs (very slow in Chrome devtools).
      console.log('[RenderingCoordinator] Starting batch with', plotIds.length, 'plots');
    }

    // Register all plots
    plotIds.forEach(id => pendingPlotsRef.current.add(id));
    
    // Store completion callback
    onAllRenderedRef.current = onAllRendered;

    // Set timeout as fallback - force completion after timeout
    renderingTimeoutRef.current = setTimeout(() => {
      console.warn('[RenderingCoordinator] Rendering timeout reached, forcing completion');
      if (onAllRenderedRef.current) {
        const callback = onAllRenderedRef.current;
        onAllRenderedRef.current = null;
        pendingPlotsRef.current.clear();
        callback();
      }
    }, timeout);

    // If no plots to render, complete immediately
    if (plotIds.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[RenderingCoordinator] No plots to render, completing immediately');
      }
      const callback = onAllRenderedRef.current;
      onAllRenderedRef.current = null;
      callback();
    }
  }, []);

  /**
   * Cancel current rendering batch
   */
  const cancelRenderingBatch = useCallback(() => {
    pendingPlotsRef.current.clear();
    onAllRenderedRef.current = null;
    if (renderingTimeoutRef.current) {
      clearTimeout(renderingTimeoutRef.current);
      renderingTimeoutRef.current = null;
    }
  }, []);

  /**
   * Get current rendering state
   */
  const getRenderingState = useCallback(() => {
    return {
      pendingPlots: pendingPlotsRef.current.size,
      isRendering: pendingPlotsRef.current.size > 0,
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (renderingTimeoutRef.current) {
        clearTimeout(renderingTimeoutRef.current);
      }
    };
  }, []);

  // Return a stable object so consumers can safely include it in deps without
  // retriggering effects on every render.
  return useMemo(() => ({
    registerPlot,
    markPlotRendered,
    startRenderingBatch,
    cancelRenderingBatch,
    getRenderingState,
  }), [registerPlot, markPlotRendered, startRenderingBatch, cancelRenderingBatch, getRenderingState]);
}

