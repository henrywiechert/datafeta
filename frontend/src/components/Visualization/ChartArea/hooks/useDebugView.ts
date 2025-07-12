import { useState, useEffect, useCallback } from 'react';
import { createResizeHandler } from '../utils';

interface UseDebugViewProps {
  // No props needed for now
}

interface UseDebugViewReturn {
  isDebugOpen: boolean;
  debugHeight: number;
  maxDebugHeight: number;
  toggleDebugView: () => void;
  handleDebugResize: (newHeight: number) => void;
}

export const useDebugView = (props?: UseDebugViewProps): UseDebugViewReturn => {
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [debugHeight, setDebugHeight] = useState(300);
  const [maxDebugHeight, setMaxDebugHeight] = useState(800);

  // Toggle debug view
  const toggleDebugView = useCallback(() => {
    setIsDebugOpen(!isDebugOpen);
  }, [isDebugOpen]);

  // Handle debug resize
  const handleDebugResize = useCallback((newHeight: number) => {
    setDebugHeight(newHeight);
  }, []);

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