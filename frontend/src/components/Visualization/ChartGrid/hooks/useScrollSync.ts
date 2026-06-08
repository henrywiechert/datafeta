// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { MAP_WHEEL_ROOT_SELECTOR } from '../../map/attachMapPanZoom';

/** Gantt zoom range representing the visible data range on the timeline axis */
export interface GanttZoomRange {
  min: number;
  max: number;
}

export interface ScrollOffsets {
  horizontal: number;
  vertical: number;
}

export interface ScrollSyncState {
  scrollOffsets: ScrollOffsets;
  onWheelCapture: (e: React.WheelEvent<HTMLDivElement>, leftFixedWidthPx: number) => void;
  /** Whether keyboard navigation is active (container is focused/hovered) */
  isKeyboardNavActive: boolean;
}

/** Minimum zoom range in data units (prevents zooming in too far) */
const MIN_GANTT_ZOOM_RANGE = 100;

/** Zoom/pan factor per key press (20%) */
const ZOOM_PAN_FACTOR = 0.2;

/** Key repeat delay for held keys (ms) */
const KEY_REPEAT_DELAY = 150;

/**
 * Hook for synchronizing scroll between horizontal and vertical layers
 * Handles wheel event routing, scroll offset tracking, and Gantt chart keyboard navigation
 * 
 * Keyboard controls (when hovering over Gantt chart):
 * - W: Zoom in (show less time range with more detail)
 * - S: Zoom out (show more time range with less detail)
 * - A: Pan left (earlier in time)
 * - D: Pan right (later in time)
 * - R: Reset zoom (show full data range)
 * 
 * @param usesGridLayout - True when using the MultiPlotGrid architecture (including single plots)
 * @param isGanttChart - True when current chart is a Gantt chart (enables WASD navigation)
 * @param ganttZoomRange - Current zoom range (null = full data range)
 * @param onGanttZoomRangeChange - Callback when zoom range changes
 * @param ganttFullDataRange - Full data range for zoom calculations
 */
export function useScrollSync(
  hScrollRef: RefObject<HTMLDivElement>,
  vScrollRef: RefObject<HTMLDivElement>,
  plotsTranslateRef: RefObject<HTMLDivElement>,
  containerRef: RefObject<HTMLDivElement>,
  usesGridLayout: boolean,
  isGanttChart: boolean = false,
  ganttZoomRange: GanttZoomRange | null = null,
  onGanttZoomRangeChange?: (range: GanttZoomRange | null) => void,
  ganttFullDataRange: GanttZoomRange | null = null
): ScrollSyncState {
  const [scrollOffsets, setScrollOffsets] = useState<ScrollOffsets>({
    horizontal: 0,
    vertical: 0,
  });

  // Track whether mouse is over the container (enables keyboard nav)
  const [isKeyboardNavActive, setIsKeyboardNavActive] = useState(false);
  
  // Track currently held keys for repeat handling
  const heldKeysRef = useRef<Set<string>>(new Set());
  const keyRepeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Store refs to current values for use in event handlers
  const ganttZoomRangeRef = useRef(ganttZoomRange);
  const ganttFullDataRangeRef = useRef(ganttFullDataRange);
  const onGanttZoomRangeChangeRef = useRef(onGanttZoomRangeChange);
  const isKeyboardNavActiveRef = useRef(isKeyboardNavActive);
  
  useEffect(() => {
    ganttZoomRangeRef.current = ganttZoomRange;
  }, [ganttZoomRange]);
  
  useEffect(() => {
    ganttFullDataRangeRef.current = ganttFullDataRange;
  }, [ganttFullDataRange]);
  
  useEffect(() => {
    onGanttZoomRangeChangeRef.current = onGanttZoomRangeChange;
  }, [onGanttZoomRangeChange]);
  
  useEffect(() => {
    isKeyboardNavActiveRef.current = isKeyboardNavActive;
  }, [isKeyboardNavActive]);

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

  // Handle zoom/pan action
  const handleZoomPan = useCallback((action: 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight') => {
    const fullRange = ganttFullDataRangeRef.current;
    const currentZoomRange = ganttZoomRangeRef.current;
    const onZoomChange = onGanttZoomRangeChangeRef.current;
    
    if (!fullRange || !onZoomChange) return;
    
    const currentRange = currentZoomRange || fullRange;
    const currentRangeSize = currentRange.max - currentRange.min;
    const fullRangeSize = fullRange.max - fullRange.min;
    
    let newMin: number;
    let newMax: number;
    
    switch (action) {
      case 'zoomIn': {
        // Reduce range size by ZOOM_PAN_FACTOR, centered
        const newRangeSize = Math.max(MIN_GANTT_ZOOM_RANGE, currentRangeSize * (1 - ZOOM_PAN_FACTOR));
        const center = (currentRange.min + currentRange.max) / 2;
        newMin = center - newRangeSize / 2;
        newMax = center + newRangeSize / 2;
        break;
      }
      
      case 'zoomOut': {
        // Increase range size by ZOOM_PAN_FACTOR, centered
        const newRangeSize = currentRangeSize * (1 + ZOOM_PAN_FACTOR);
        
        // If we'd exceed full range, reset to full
        if (newRangeSize >= fullRangeSize) {
          onZoomChange(null);
          return;
        }
        
        const center = (currentRange.min + currentRange.max) / 2;
        newMin = center - newRangeSize / 2;
        newMax = center + newRangeSize / 2;
        break;
      }
      
      case 'panLeft': {
        // Move left by ZOOM_PAN_FACTOR of current range
        const panAmount = currentRangeSize * ZOOM_PAN_FACTOR;
        newMin = currentRange.min - panAmount;
        newMax = currentRange.max - panAmount;
        break;
      }
      
      case 'panRight': {
        // Move right by ZOOM_PAN_FACTOR of current range
        const panAmount = currentRangeSize * ZOOM_PAN_FACTOR;
        newMin = currentRange.min + panAmount;
        newMax = currentRange.max + panAmount;
        break;
      }
      
      default:
        return;
    }
    
    // Clamp to full data range bounds
    if (newMin < fullRange.min) {
      const shift = fullRange.min - newMin;
      newMin = fullRange.min;
      newMax = Math.min(fullRange.max, newMax + shift);
    }
    if (newMax > fullRange.max) {
      const shift = newMax - fullRange.max;
      newMax = fullRange.max;
      newMin = Math.max(fullRange.min, newMin - shift);
    }
    
    // Apply the new zoom range
    onZoomChange({ min: newMin, max: newMax });
  }, []);

  // Process held keys (for key repeat)
  const processHeldKeys = useCallback(() => {
    const keys = heldKeysRef.current;
    if (keys.has('w')) handleZoomPan('zoomIn');
    if (keys.has('s')) handleZoomPan('zoomOut');
    if (keys.has('a')) handleZoomPan('panLeft');
    if (keys.has('d')) handleZoomPan('panRight');
  }, [handleZoomPan]);

  // Keyboard event handlers for WASD navigation
  useEffect(() => {
    if (!isGanttChart) return;
    
    const container = containerRef.current;
    if (!container) return;

    const handleMouseEnter = () => {
      setIsKeyboardNavActive(true);
    };

    const handleMouseLeave = () => {
      setIsKeyboardNavActive(false);
      // Clear held keys when leaving
      heldKeysRef.current.clear();
      if (keyRepeatTimerRef.current) {
        clearInterval(keyRepeatTimerRef.current);
        keyRepeatTimerRef.current = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle WASD + R keys
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'r'].includes(key)) return;
      
      // Only process if keyboard nav is active (mouse over container)
      if (!isKeyboardNavActiveRef.current) return;
      
      // Don't intercept keys when user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      // Prevent default to avoid scrolling the page
      e.preventDefault();
      
      // Handle 'r' for reset - no repeat needed
      if (key === 'r') {
        const onZoomChange = onGanttZoomRangeChangeRef.current;
        if (onZoomChange) {
          onZoomChange(null); // Reset to full range
        }
        return;
      }
      
      // If key is already held, don't process again (handled by repeat timer)
      if (heldKeysRef.current.has(key)) return;
      
      // Add to held keys
      heldKeysRef.current.add(key);
      
      // Process immediately on first press
      switch (key) {
        case 'w': handleZoomPan('zoomIn'); break;
        case 's': handleZoomPan('zoomOut'); break;
        case 'a': handleZoomPan('panLeft'); break;
        case 'd': handleZoomPan('panRight'); break;
      }
      
      // Start repeat timer if not already running
      if (!keyRepeatTimerRef.current) {
        keyRepeatTimerRef.current = setInterval(processHeldKeys, KEY_REPEAT_DELAY);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd'].includes(key)) return;
      
      // Remove from held keys
      heldKeysRef.current.delete(key);
      
      // Stop repeat timer if no keys held
      if (heldKeysRef.current.size === 0 && keyRepeatTimerRef.current) {
        clearInterval(keyRepeatTimerRef.current);
        keyRepeatTimerRef.current = null;
      }
    };

    // Attach mouse enter/leave to container
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    
    // Attach keyboard handlers to window
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      
      if (keyRepeatTimerRef.current) {
        clearInterval(keyRepeatTimerRef.current);
        keyRepeatTimerRef.current = null;
      }
    };
  }, [containerRef, isGanttChart, handleZoomPan, processHeldKeys]);

  // Wheel routing handler for regular scrolling
  const onWheelCapture = useCallback((e: React.WheelEvent<HTMLDivElement>, leftFixedWidthPx: number) => {
    const target = e.nativeEvent.target;
    if (target instanceof Element && target.closest(MAP_WHEEL_ROOT_SELECTOR)) {
      return;
    }

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
    isKeyboardNavActive,
  };
}
