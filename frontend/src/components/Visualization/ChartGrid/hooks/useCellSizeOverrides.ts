import { useState, useEffect, useCallback } from 'react';
import { PlotResult } from '../../../../observable-plot-generator/types';

export interface CellSizeOverrides {
  userCellWidth: number | null;
  userCellHeight: number | null;
  hasOverrides: boolean;
  handleColumnResize: (newWidth: number) => void;
  handleRowResize: (newHeight: number) => void;
  handleReset: () => void;
}

/**
 * Hook for managing user-controlled cell size overrides
 * Resets automatically when spec layout changes
 */
export function useCellSizeOverrides(spec: PlotResult | null): CellSizeOverrides {
  const [userCellWidth, setUserCellWidth] = useState<number | null>(null);
  const [userCellHeight, setUserCellHeight] = useState<number | null>(null);

  // Reset user overrides when spec changes (new data/chart type)
  useEffect(() => {
    setUserCellWidth(null);
    setUserCellHeight(null);
  }, [spec?.layout?.columns, spec?.layout?.rows]);

  const handleColumnResize = useCallback((newWidth: number) => {
    const constrainedWidth = Math.max(50, Math.min(5000, Math.round(newWidth)));
    setUserCellWidth(constrainedWidth);
  }, []);

  const handleRowResize = useCallback((newHeight: number) => {
    const constrainedHeight = Math.max(50, Math.min(5000, Math.round(newHeight)));
    setUserCellHeight(constrainedHeight);
  }, []);

  const handleReset = useCallback(() => {
    setUserCellWidth(null);
    setUserCellHeight(null);
  }, []);

  const hasOverrides = userCellWidth !== null || userCellHeight !== null;

  return {
    userCellWidth,
    userCellHeight,
    hasOverrides,
    handleColumnResize,
    handleRowResize,
    handleReset,
  };
}
