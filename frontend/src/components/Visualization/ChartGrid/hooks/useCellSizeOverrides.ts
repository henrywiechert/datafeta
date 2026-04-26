import { useState, useEffect, useCallback, useMemo } from 'react';
import { PlotResult } from '../../../../observable-plot-generator/types';
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
 * Resets automatically when spec layout changes
 * 
 * Minimum size is based on layout.minRowSizes/minColumnSizes (e.g., categories * MIN_BAR_STEP_PX)
 * rather than a fixed value, so bar charts with more categories have a larger minimum.
 */
export function useCellSizeOverrides(spec: PlotResult | null): CellSizeOverrides {
  const [userCellWidth, setUserCellWidth] = useState<number | null>(null);
  const [userCellHeight, setUserCellHeight] = useState<number | null>(null);

  const constraints = useMemo(
    () => getUniformCellSizeConstraints(spec?.layout),
    [spec?.layout]
  );

  const layoutSignature = useMemo(
    () => JSON.stringify({
      columns: spec?.layout?.columns,
      rows: spec?.layout?.rows,
      columnSizes: spec?.layout?.columnSizes,
      rowSizes: spec?.layout?.rowSizes,
      minColumnSizes: spec?.layout?.minColumnSizes,
      minRowSizes: spec?.layout?.minRowSizes,
    }),
    [spec?.layout]
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
