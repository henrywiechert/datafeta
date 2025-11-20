import { useState, useCallback } from 'react';
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
 */
export function useChartTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    fields: [],
  });

  const showTooltip = useCallback((
    x: number,
    y: number,
    fields: TooltipField[]
  ) => {
    console.log('[useChartTooltip] showTooltip called:', { x, y, fieldsCount: fields.length, fields });
    setTooltip({
      visible: true,
      x,
      y,
      fields,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    console.log('[useChartTooltip] hideTooltip called');
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  const updatePosition = useCallback((x: number, y: number) => {
    setTooltip(prev => prev.visible ? { ...prev, x, y } : prev);
  }, []);

  return {
    tooltip,
    showTooltip,
    hideTooltip,
    updatePosition,
  };
}

