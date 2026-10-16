// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useState, useEffect, useCallback, RefObject } from 'react';
import { isViewportZoomWheel } from '../viewport/useViewportGestures';

export interface ScrollOffsets {
  horizontal: number;
  vertical: number;
}

export interface ScrollSyncState {
  scrollOffsets: ScrollOffsets;
  onWheelCapture: (e: React.WheelEvent<HTMLDivElement>, leftFixedWidthPx: number) => void;
}

/** Finger travel before a touch drag commits to horizontal or vertical (px) */
const TOUCH_AXIS_LOCK_PX = 6;

/**
 * Hook for synchronizing scroll between horizontal and vertical layers
 * Handles wheel event routing and scroll offset tracking. Pan/zoom gestures
 * (Alt+wheel, drag, WASD) live in ../viewport.
 *
 * @param usesGridLayout - True when using the MultiPlotGrid architecture (including single plots)
 */
export function useScrollSync(
  hScrollRef: RefObject<HTMLDivElement>,
  vScrollRef: RefObject<HTMLDivElement>,
  plotsTranslateRef: RefObject<HTMLDivElement>,
  containerRef: RefObject<HTMLDivElement>,
  usesGridLayout: boolean
): ScrollSyncState {
  const [scrollOffsets, setScrollOffsets] = useState<ScrollOffsets>({
    horizontal: 0,
    vertical: 0,
  });

  // Keep the plots grid in the horizontal layer visually in sync with the
  // vertical scroller by translating it opposite to the vertical scroll offset.
  useEffect(() => {
    const scroller = vScrollRef.current;
    const target = plotsTranslateRef.current;
    if (!scroller || !target) return;

    const onScroll = () => {
      const y = scroller.scrollTop;
      (target as HTMLDivElement).style.transform = `translateY(${-y}px)`;
      setScrollOffsets((prev) =>
        prev.vertical === y ? prev : { ...prev, vertical: y }
      );
    };

    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => scroller.removeEventListener('scroll', onScroll as any);
  }, [usesGridLayout, vScrollRef, plotsTranslateRef]);

  // Track horizontal scroll so column resize handles track the visible gridlines.
  useEffect(() => {
    const scroller = hScrollRef.current;
    if (!scroller) return;

    const onScroll = () => {
      const x = scroller.scrollLeft;
      setScrollOffsets((prev) =>
        prev.horizontal === x ? prev : { ...prev, horizontal: x }
      );
    };

    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => scroller.removeEventListener('scroll', onScroll as any);
  }, [usesGridLayout, hScrollRef]);

  // Touch counterpart of onWheelCapture. The horizontal layer (touch-action:
  // pan-x in tablet mode, see MultiPlotGrid) scrolls natively left/right but
  // cannot scroll vertically, so a vertical finger drag on it is forwarded to
  // the vertical scroller.
  useEffect(() => {
    const surface = hScrollRef.current;
    if (!surface) return;

    let startX = 0;
    let startY = 0;
    let lastY: number | null = null;
    let axis: 'x' | 'y' | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        lastY = null;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      lastY = t.clientY;
      axis = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (lastY === null || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!axis) {
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if (dx < TOUCH_AXIS_LOCK_PX && dy < TOUCH_AXIS_LOCK_PX) return;
        axis = dy > dx ? 'y' : 'x';
      }
      if (axis === 'y' && vScrollRef.current) {
        vScrollRef.current.scrollTop += lastY - t.clientY;
      }
      lastY = t.clientY;
    };

    const onTouchEnd = () => {
      lastY = null;
      axis = null;
    };

    surface.addEventListener('touchstart', onTouchStart, { passive: true });
    surface.addEventListener('touchmove', onTouchMove, { passive: true });
    surface.addEventListener('touchend', onTouchEnd);
    surface.addEventListener('touchcancel', onTouchEnd);
    return () => {
      surface.removeEventListener('touchstart', onTouchStart);
      surface.removeEventListener('touchmove', onTouchMove);
      surface.removeEventListener('touchend', onTouchEnd);
      surface.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [usesGridLayout, hScrollRef, vScrollRef]);

  // Wheel routing handler for regular scrolling
  const onWheelCapture = useCallback((e: React.WheelEvent<HTMLDivElement>, leftFixedWidthPx: number) => {
    // Alt+wheel belongs to the cell's pan/zoom handler, which listens
    // below this root-delegated capture handler; let it through.
    if (isViewportZoomWheel(e.nativeEvent)) return;

    const rect = containerRef.current?.getBoundingClientRect();
    const x = e.clientX;
    const inLeftFixed = !!rect && x <= rect.left + leftFixedWidthPx + 1;
    
    // Standard scroll handling
    // Always drive vertical scroll with deltaY
    if (vScrollRef.current && e.deltaY !== 0) {
      vScrollRef.current.scrollBy({ top: e.deltaY });
    }
    
    // Drive horizontal scroll only when not over the left fixed area
    if (!inLeftFixed && hScrollRef.current && e.deltaX !== 0) {
      hScrollRef.current.scrollBy({ left: e.deltaX });
    }
    
    if (e.deltaX !== 0 || e.deltaY !== 0) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [
    containerRef,
    hScrollRef,
    vScrollRef,
  ]);

  return {
    scrollOffsets,
    onWheelCapture,
  };
}
