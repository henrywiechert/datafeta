import { useState, useEffect, useCallback, useMemo } from 'react';
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import {
  getUniformCellSizeConstraints,
  resolveUniformColumnSize,
  resolveUniformRowSize,
  UniformResizeIntent,
} from '../utils/uniformCellSizing';

export interface CellSizeOverrides {
  userCellWidth: number | null;
  userCellHeight: number | null;
  hasOverrides: boolean;
  previewColumnResize: (intent: UniformResizeIntent) => number;
  previewRowResize: (intent: UniformResizeIntent) => number;
  handleColumnResize: (intent: UniformResizeIntent) => void;
  handleRowResize: (intent: UniformResizeIntent) => void;
  handleReset: () => void;
}

/**
 * Hook for managing user-controlled cell size overrides
 * Resets automatically when grid layout changes
 *
 * Minimum size is based on layout.minRowSizes/minColumnSizes (e.g., categories * MIN_BAR_STEP_PX)
 * rather than a fixed value, so bar charts with more categories have a larger minimum.
 */
export function useCellSizeOverrides(grid: GridResultModel | null): CellSizeOverrides {
  const [userCellWidth, setUserCellWidth] = useState<number | null>(null);
  const [userCellHeight, setUserCellHeight] = useState<number | null>(null);

  const constraints = useMemo(
    () => getUniformCellSizeConstraints(grid?.layout),
    [grid?.layout]
  );

  const layoutSignature = useMemo(
    () => JSON.stringify({
      columns: grid?.layout?.columns,
      rows: grid?.layout?.rows,
      columnSizes: grid?.layout?.columnSizes,
      rowSizes: grid?.layout?.rowSizes,
      minColumnSizes: grid?.layout?.minColumnSizes,
      minRowSizes: grid?.layout?.minRowSizes,
    }),
    [grid?.layout]
  );

  // Reset user overrides when the generated grid shape or sizing contract changes.
  useEffect(() => {
    setUserCellWidth(null);
    setUserCellHeight(null);
  }, [layoutSignature]);

  const previewColumnResize = useCallback((intent: UniformResizeIntent) => {
    return resolveUniformColumnSize(intent, constraints);
  }, [constraints]);

  const previewRowResize = useCallback((intent: UniformResizeIntent) => {
    return resolveUniformRowSize(intent, constraints);
  }, [constraints]);

  const handleColumnResize = useCallback((intent: UniformResizeIntent) => {
    setUserCellWidth(resolveUniformColumnSize(intent, constraints));
  }, [constraints]);

  const handleRowResize = useCallback((intent: UniformResizeIntent) => {
    setUserCellHeight(resolveUniformRowSize(intent, constraints));
  }, [constraints]);

  const handleReset = useCallback(() => {
    setUserCellWidth(null);
    setUserCellHeight(null);
  }, []);

  const hasOverrides = userCellWidth !== null || userCellHeight !== null;

  return {
    userCellWidth,
    userCellHeight,
    hasOverrides,
    previewColumnResize,
    previewRowResize,
    handleColumnResize,
    handleRowResize,
    handleReset,
  };
}
