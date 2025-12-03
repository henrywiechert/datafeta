import { useState, useEffect, RefObject } from 'react';

export interface ScrollOffsets {
  horizontal: number;
  vertical: number;
}

export interface ScrollSyncState {
  scrollOffsets: ScrollOffsets;
  onWheelCapture: (e: React.WheelEvent<HTMLDivElement>, leftFixedWidthPx: number) => void;
}

/**
 * Hook for synchronizing scroll between horizontal and vertical layers
 * Handles wheel event routing and scroll offset tracking
 * 
 * @param usesGridLayout - True when using the MultiPlotGrid architecture (including single plots)
 *   This triggers re-attachment of scroll handlers when the layout structure changes
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
      // Keep vertical scroll offset in state for the resize overlay.
      setScrollOffsets((prev) =>
        prev.vertical === y ? prev : { ...prev, vertical: y }
      );
    };

    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => scroller.removeEventListener('scroll', onScroll as any);
  }, [usesGridLayout, vScrollRef, plotsTranslateRef]); // Re-attach when plot structure changes, not on every spec change

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
  }, [usesGridLayout, hScrollRef]); // Re-attach when plot structure changes, not on every spec change

  // Wheel routing handler
  const onWheelCapture = (e: React.WheelEvent<HTMLDivElement>, leftFixedWidthPx: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = e.clientX;
    const inLeftFixed = !!rect && x <= rect.left + leftFixedWidthPx + 1;
    
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
  };

  return {
    scrollOffsets,
    onWheelCapture,
  };
}
