import { useState, useEffect, useRef, RefObject } from 'react';

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Hook for tracking container dimensions with ResizeObserver.
 *
 * Respects the stabilization period from `useStabilization` to avoid
 * intermediate updates while the grid is changing shape, but — unlike a
 * straight gate — defers any dropped update and re-applies it once
 * stabilization ends. Without this recovery step a ResizeObserver event that
 * coincided with a stabilization window (e.g. a fullscreen toggle, sheet
 * switch, or large filter change that re-faceted the chart) was silently
 * dropped and `containerDimensions` would keep its pre-resize value,
 * stranding the bottom border and X-scale resize handle at the old position.
 */
export function useContainerDimensions(
  containerRef: RefObject<HTMLDivElement>,
  isStabilizing: boolean = false,
): Dimensions {
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 0, height: 0 });
  // Set to true when a ResizeObserver-driven update is dropped because the
  // container is currently stabilizing. The post-stabilization effect below
  // re-runs the measurement when the flag is consumed.
  const hasPendingUpdateRef = useRef(false);
  // Latest measurement closure, so the post-stabilization effect can invoke
  // the same function the ResizeObserver path uses.
  const remeasureRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!containerRef.current) return;

    let rafId: number | null = null;
    let debounceTimeoutId: number | null = null;
    let isUpdateScheduled = false;

    const updateDimensions = () => {
      if (!containerRef.current) {
        isUpdateScheduled = false;
        return;
      }

      // During stabilization, defer instead of dropping: remember that a
      // remeasure is owed and bail out. The effect that watches
      // `isStabilizing` will replay the measurement once stabilization ends.
      if ((containerRef.current as any).__isStabilizing) {
        hasPendingUpdateRef.current = true;
        isUpdateScheduled = false;
        return;
      }

      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;

      hasPendingUpdateRef.current = false;
      setDimensions((prev) => {
        // Only update if actually changed to avoid unnecessary renders
        if (prev.width === newWidth && prev.height === newHeight) {
          return prev;
        }
        return { width: newWidth, height: newHeight };
      });

      isUpdateScheduled = false;
    };
    remeasureRef.current = updateDimensions;

    // Debounce + RAF throttling for smoother updates
    const scheduleUpdate = () => {
      if (!isUpdateScheduled) {
        isUpdateScheduled = true;

        if (debounceTimeoutId !== null) {
          clearTimeout(debounceTimeoutId);
        }

        // Shorter debounce for container (50ms) since it's less disruptive
        debounceTimeoutId = window.setTimeout(() => {
          rafId = requestAnimationFrame(updateDimensions);
          debounceTimeoutId = null;
        }, 50);
      }
    };

    // Initial measurement (immediate, no debounce)
    updateDimensions();

    // Observe size changes with debounced RAF throttling
    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(containerRef.current);

    // Also listen to window resize as a backstop. ResizeObserver alone is
    // unreliable for browser-zoom (Ctrl +/-) and some window-resize paths:
    // depending on the browser version and flex-tree configuration, the
    // observer may not fire even though the container's CSS-pixel size
    // changed. `useRowHeightCalculation` already does this — mirroring it
    // here keeps container dims and row heights in sync across both signals.
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (debounceTimeoutId !== null) {
        clearTimeout(debounceTimeoutId);
      }
    };
  }, [containerRef]); // Empty deps - container size tracking is independent of spec

  // Apply any deferred measurement once stabilization ends. Triggered by
  // `isStabilizing` going from true → false, which matches the contract in
  // `useStabilization` (and mirrors the pending-height pattern in
  // `useRowHeightCalculation`).
  useEffect(() => {
    if (isStabilizing) return;
    if (!hasPendingUpdateRef.current) return;
    // Wait for the browser to lay out the post-stabilization frame before
    // measuring, otherwise we'd risk reading stale dimensions ourselves.
    const rafId = requestAnimationFrame(() => {
      remeasureRef.current();
    });
    return () => cancelAnimationFrame(rafId);
  }, [isStabilizing]);

  return dimensions;
}
