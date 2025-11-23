import { useState, useEffect, RefObject } from 'react';

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Hook for tracking container dimensions with ResizeObserver
 * Respects stabilization period to avoid intermediate updates
 */
export function useContainerDimensions(
  containerRef: RefObject<HTMLDivElement>
): Dimensions {
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 0, height: 0 });

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

      // CRITICAL: Don't update during stabilization period
      if ((containerRef.current as any).__isStabilizing) {
        isUpdateScheduled = false;
        return;
      }

      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;

      setDimensions((prev) => {
        // Only update if actually changed to avoid unnecessary renders
        if (prev.width === newWidth && prev.height === newHeight) {
          return prev;
        }
        return { width: newWidth, height: newHeight };
      });

      isUpdateScheduled = false;
    };

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

    return () => {
      ro.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (debounceTimeoutId !== null) {
        clearTimeout(debounceTimeoutId);
      }
    };
  }, [containerRef]); // Empty deps - container size tracking is independent of spec

  return dimensions;
}
