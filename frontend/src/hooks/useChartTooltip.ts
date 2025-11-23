import { useState, useCallback, useRef, useEffect } from 'react';
import { TooltipField } from '../components/Visualization/CustomTooltip/CustomTooltip';

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  fields: TooltipField[];
}

/**
 * Hook for managing custom chart tooltip state.
 * Provides show, hide, and update methods for tooltip management.
 * Includes auto-hide timeout as safety fallback.
 */
export function useChartTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    fields: [],
  });
  
  const autoHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const AUTO_HIDE_DELAY = 10000; // 10 seconds - safety timeout

  const showTooltip = useCallback((
    x: number,
    y: number,
    fields: TooltipField[]
  ) => {
    console.log('[useChartTooltip] showTooltip called:', { x, y, fieldsCount: fields.length, fields });
    
    // Clear any existing auto-hide timeout
    if (autoHideTimeoutRef.current) {
      clearTimeout(autoHideTimeoutRef.current);
    }
    
    setTooltip({
      visible: true,
      x,
      y,
      fields,
    });
    
    // Set auto-hide timeout as safety fallback
    autoHideTimeoutRef.current = setTimeout(() => {
      console.log('[useChartTooltip] Auto-hiding tooltip after timeout');
      setTooltip(prev => ({ ...prev, visible: false }));
    }, AUTO_HIDE_DELAY);
  }, []);

  const hideTooltip = useCallback(() => {
    console.log('[useChartTooltip] hideTooltip called');
    
    // Clear auto-hide timeout
    if (autoHideTimeoutRef.current) {
      clearTimeout(autoHideTimeoutRef.current);
      autoHideTimeoutRef.current = null;
    }
    
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  const updatePosition = useCallback((x: number, y: number) => {
    setTooltip(prev => prev.visible ? { ...prev, x, y } : prev);
  }, []);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoHideTimeoutRef.current) {
        clearTimeout(autoHideTimeoutRef.current);
      }
    };
  }, []);

  return {
    tooltip,
    showTooltip,
    hideTooltip,
    updatePosition,
  };
}

