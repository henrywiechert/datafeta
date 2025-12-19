import { useState, useEffect, useCallback, useMemo } from 'react';
import { PlotResult } from '../../../../observable-plot-generator/types';

// Absolute minimum size for any chart (fallback when no min size specified)
const ABSOLUTE_MIN_SIZE = 50;
const MAX_SIZE = 5000;

export interface CellSizeOverrides {
  userCellWidth: number | null;
  userCellHeight: number | null;
  hasOverrides: boolean;
  handleColumnResize: (newWidth: number) => void;
  handleRowResize: (newHeight: number) => void;
  handleReset: () => void;
}

/**
 * Extract the minimum cell size from layout.
 * For bar/tick charts, this is based on categories.length * MIN_BAR_STEP_PX.
 * Returns the first numeric value found in minSizes array, or the fallback.
 */
function getMinSize(minSizes: Array<number> | undefined, fallback: number): number {
  if (!minSizes || minSizes.length === 0) return fallback;
  // Return the first minimum size
  return minSizes[0];
}

/**
 * Hook for managing user-controlled cell size overrides
 * Resets automatically when spec layout changes
 * 
 * Minimum size is based on layout.minRowSizes/minColumnSizes (e.g., categories * MIN_BAR_STEP_PX)
 * rather than a fixed value, so bar charts with more categories have a larger minimum.
 */
export function useCellSizeOverrides(spec: PlotResult | null): CellSizeOverrides {
  const [userCellWidth, setUserCellWidth] = useState<number | null>(null);
  const [userCellHeight, setUserCellHeight] = useState<number | null>(null);

  // Extract minimum sizes from spec layout (based on categories * MIN_BAR_STEP_PX)
  const minWidth = useMemo(() => 
    getMinSize(spec?.layout?.minColumnSizes, ABSOLUTE_MIN_SIZE),
    [spec?.layout?.minColumnSizes]
  );
  const minHeight = useMemo(() => 
    getMinSize(spec?.layout?.minRowSizes, ABSOLUTE_MIN_SIZE),
    [spec?.layout?.minRowSizes]
  );

  // Reset user overrides when spec changes (new data/chart type)
  useEffect(() => {
    setUserCellWidth(null);
    setUserCellHeight(null);
  }, [spec?.layout?.columns, spec?.layout?.rows]);

  const handleColumnResize = useCallback((newWidth: number) => {
    // Minimum is based on categories * MIN_BAR_STEP_PX for bar/tick charts
    const constrainedWidth = Math.max(minWidth, Math.min(MAX_SIZE, Math.round(newWidth)));
    setUserCellWidth(constrainedWidth);
  }, [minWidth]);

  const handleRowResize = useCallback((newHeight: number) => {
    // Minimum is based on categories * MIN_BAR_STEP_PX for bar/tick charts
    const constrainedHeight = Math.max(minHeight, Math.min(MAX_SIZE, Math.round(newHeight)));
    setUserCellHeight(constrainedHeight);
  }, [minHeight]);

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
