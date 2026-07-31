// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useState, useEffect, useCallback } from 'react';
import { createResizeHandler } from '../utils';

interface UseDebugViewProps {
  /** Initial debug view height in pixels (restored per-sheet). */
  initialHeight?: number;
  /** Called with the final height when the user finishes resizing (persist per-sheet). */
  onHeightCommit?: (height: number) => void;
}

interface UseDebugViewReturn {
  isDebugOpen: boolean;
  debugHeight: number;
  maxDebugHeight: number;
  toggleDebugView: () => void;
  handleDebugResize: (newHeight: number) => void;
}

export const useDebugView = (props?: UseDebugViewProps): UseDebugViewReturn => {
  const { initialHeight, onHeightCommit } = props ?? {};
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [debugHeight, setDebugHeight] = useState(initialHeight ?? 300);
  const [maxDebugHeight, setMaxDebugHeight] = useState(800);

  // Toggle debug view
  const toggleDebugView = useCallback(() => {
    setIsDebugOpen(!isDebugOpen);
  }, [isDebugOpen]);

  // Handle debug resize. The resize handle is deferred, so this fires once on
  // release — a safe point to persist the height per-sheet.
  const handleDebugResize = useCallback((newHeight: number) => {
    setDebugHeight(newHeight);
    onHeightCommit?.(Math.round(newHeight));
  }, [onHeightCommit]);

  // Set up resize handler for dynamic max height calculation
  useEffect(() => {
    const cleanup = createResizeHandler(setMaxDebugHeight, setDebugHeight);
    return cleanup;
  }, []);

  return {
    isDebugOpen,
    debugHeight,
    maxDebugHeight,
    toggleDebugView,
    handleDebugResize,
  };
}; 