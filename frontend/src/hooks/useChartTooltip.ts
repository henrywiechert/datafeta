// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useState, useCallback, useRef, useEffect } from 'react';
import { PinnedTooltipComparison, TooltipField } from '../types';

interface TooltipState {
  visible: boolean;
  pinned: boolean;
  x: number;
  y: number;
  fields: TooltipField[];
  colorHex?: string;
  pinnedComparison?: PinnedTooltipComparison;
}

/**
 * Hook for managing custom chart tooltip state.
 * Provides show, hide, pin/unpin, and update methods for tooltip management.
 * Includes auto-hide timeout as safety fallback (disabled while pinned).
 */
export function useChartTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    pinned: false,
    x: 0,
    y: 0,
    fields: [],
  });
  
  const autoHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pinnedRef = useRef(false); // mirror for use in imperative DOM listeners
  const AUTO_HIDE_DELAY = 10000; // 10 seconds - safety timeout

  const clearAutoHide = useCallback(() => {
    if (autoHideTimeoutRef.current) {
      clearTimeout(autoHideTimeoutRef.current);
      autoHideTimeoutRef.current = null;
    }
  }, []);

  const showTooltip = useCallback((
    x: number,
    y: number,
    fields: TooltipField[],
    colorHex?: string,
    pinnedComparison?: PinnedTooltipComparison
  ) => {
    // Clear any existing auto-hide timeout
    clearAutoHide();
    
    setTooltip({
      visible: true,
      pinned: false,
      x,
      y,
      fields,
      colorHex,
      pinnedComparison,
    });
    
    // Set auto-hide timeout as safety fallback
    autoHideTimeoutRef.current = setTimeout(() => {
      // Don't auto-hide if the tooltip has been pinned since
      if (!pinnedRef.current) {
        setTooltip(prev => prev.pinned ? prev : { ...prev, visible: false });
      }
    }, AUTO_HIDE_DELAY);
  }, [clearAutoHide]);

  /** Pin the tooltip in place — disables auto-hide and position tracking. */
  const pinTooltip = useCallback(() => {
    clearAutoHide();
    pinnedRef.current = true;
    setTooltip(prev => prev.visible ? { ...prev, pinned: true } : prev);
  }, [clearAutoHide]);

  /** Show tooltip content and pin in one update (avoids document-click races on mark click). */
  const showAndPinTooltip = useCallback((
    x: number,
    y: number,
    fields: TooltipField[],
    colorHex?: string,
    pinnedComparison?: PinnedTooltipComparison,
  ) => {
    clearAutoHide();
    pinnedRef.current = true;
    setTooltip({
      visible: true,
      pinned: true,
      x,
      y,
      fields,
      colorHex,
      pinnedComparison,
    });
  }, [clearAutoHide]);

  /** Unpin and hide the tooltip. */
  const unpinTooltip = useCallback(() => {
    clearAutoHide();
    pinnedRef.current = false;
    setTooltip(prev => ({ ...prev, visible: false, pinned: false }));
  }, [clearAutoHide]);

  const hideTooltip = useCallback(() => {
    // If pinned, ignore hide requests (use unpinTooltip to force-hide)
    if (pinnedRef.current) return;
    clearAutoHide();
    setTooltip(prev => prev.pinned ? prev : { ...prev, visible: false });
  }, [clearAutoHide]);

  const updatePosition = useCallback((x: number, y: number) => {
    // Don't move a pinned tooltip
    setTooltip(prev => (prev.visible && !prev.pinned) ? { ...prev, x, y } : prev);
  }, []);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearAutoHide();
    };
  }, [clearAutoHide]);

  return {
    tooltip,
    showTooltip,
    hideTooltip,
    updatePosition,
    pinTooltip,
    showAndPinTooltip,
    unpinTooltip,
    /** Ref-based pinned state for imperative DOM event handlers */
    pinnedRef,
  };
}

