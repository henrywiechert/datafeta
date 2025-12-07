import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DragSource } from './types';

interface UseTruncationDetectionProps {
  source: DragSource;
  fieldPropertiesKey: string; // Stable key for field properties
  isDragging: boolean;
}

interface UseTruncationDetectionReturn {
  isTruncated: boolean;
  chipLabelRef: React.RefObject<HTMLSpanElement>;
  chipRef: React.RefObject<HTMLDivElement>;
  tooltipOpen: boolean;
  handleTooltipOpen: () => void;
  handleTooltipClose: () => void;
}

/**
 * Custom hook to detect text truncation and manage tooltip state
 * Uses ResizeObserver for dynamic detection
 */
export const useTruncationDetection = ({
  source,
  fieldPropertiesKey,
  isDragging,
}: UseTruncationDetectionProps): UseTruncationDetectionReturn => {
  const chipLabelRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const isAxisChip = source === 'X_AXIS' || source === 'Y_AXIS';

  // Function to check if text is truncated
  const checkTruncation = useCallback(() => {
    const el = chipLabelRef.current;
    if (el) {
      const scrollWidth = el.scrollWidth;
      const clientWidth = el.clientWidth;
      const isTextTruncated = scrollWidth > (clientWidth + 1);
      
      if (source === 'AVAILABLE_FIELDS') {
        // For Fields area - only show tooltip when definitely truncated
        setIsTruncated(isTextTruncated && scrollWidth - clientWidth > 5);
      } else {
        // For drop zones - show tooltip when there's any truncation
        setIsTruncated(isTextTruncated);
      }
    }
  }, [source]);

  const handleTooltipOpen = useCallback(() => {
    setTooltipOpen(true);
  }, []);

  const handleTooltipClose = useCallback(() => {
    setTooltipOpen(false);
  }, []);

  // Check for truncation when relevant properties change
  useLayoutEffect(() => {
    if (isAxisChip) {
      // For axis chips, assume always truncated (safer and avoids expensive checks)
      if (!isTruncated) {
        setIsTruncated(true);
      }
      return;
    }
    
    // Use single debounced timeout for AVAILABLE_FIELDS
    const timeoutId = setTimeout(checkTruncation, 150);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [isAxisChip, fieldPropertiesKey, checkTruncation, isTruncated]);

  // Set up ResizeObserver to detect size changes
  useLayoutEffect(() => {
    if (isAxisChip) {
      return; // Skip ResizeObserver for axis chips
    }
    
    const el = chipLabelRef.current;
    const parentEl = chipRef.current;
    
    if (el && parentEl) {
      let timeoutId: number | undefined;
      const debouncedCheck = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(() => {
          checkTruncation();
        }, 200);
      };
      
      const resizeObserver = new ResizeObserver(debouncedCheck);
      resizeObserver.observe(parentEl);
      resizeObserver.observe(el);
      
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resizeObserver.disconnect();
      };
    }
  }, [isAxisChip, checkTruncation]);

  // Hide tooltip whenever dragging starts
  useEffect(() => {
    if (isDragging) {
      setTooltipOpen(false);
    }
  }, [isDragging]);

  return {
    isTruncated,
    chipLabelRef,
    chipRef,
    tooltipOpen,
    handleTooltipOpen,
    handleTooltipClose,
  };
};
