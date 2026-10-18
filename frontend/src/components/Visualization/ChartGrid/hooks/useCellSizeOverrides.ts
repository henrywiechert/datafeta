// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useState, useCallback, useMemo } from 'react';
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import type { SheetCellSizes } from '../../../../types/sheet';
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
  /** Applies column and row sizes in one update (two separate calls would overwrite each other). */
  handleSizeResize: (columnIntent: UniformResizeIntent, rowIntent: UniformResizeIntent) => void;
  handleReset: () => void;
}

/** External (per-sheet) storage for the overrides; without it they live in local state. */
export interface CellSizeStore {
  value: SheetCellSizes | undefined;
  onChange: (value: SheetCellSizes | undefined) => void;
}

/**
 * Hook for managing user-controlled cell size overrides.
 * Stored overrides only apply while the grid layout signature matches, so a
 * layout change drops them (and they return if the same layout comes back).
 *
 * Minimum size is based on layout.minRowSizes/minColumnSizes (e.g., categories * MIN_BAR_STEP_PX)
 * rather than a fixed value, so bar charts with more categories have a larger minimum.
 */
export function useCellSizeOverrides(grid: GridResultModel | null, store?: CellSizeStore): CellSizeOverrides {
  const [localValue, setLocalValue] = useState<SheetCellSizes | undefined>(undefined);
  const storedValue = store ? store.value : localValue;
  const setStoredValue = store ? store.onChange : setLocalValue;

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

  const activeValue = storedValue?.layoutSignature === layoutSignature ? storedValue : undefined;
  const userCellWidth = activeValue?.width ?? null;
  const userCellHeight = activeValue?.height ?? null;

  const previewColumnResize = useCallback((intent: UniformResizeIntent) => {
    return resolveUniformColumnSize(intent, constraints);
  }, [constraints]);

  const previewRowResize = useCallback((intent: UniformResizeIntent) => {
    return resolveUniformRowSize(intent, constraints);
  }, [constraints]);

  const handleColumnResize = useCallback((intent: UniformResizeIntent) => {
    setStoredValue({
      width: resolveUniformColumnSize(intent, constraints),
      height: userCellHeight,
      layoutSignature,
    });
  }, [constraints, userCellHeight, layoutSignature, setStoredValue]);

  const handleRowResize = useCallback((intent: UniformResizeIntent) => {
    setStoredValue({
      width: userCellWidth,
      height: resolveUniformRowSize(intent, constraints),
      layoutSignature,
    });
  }, [constraints, userCellWidth, layoutSignature, setStoredValue]);

  const handleSizeResize = useCallback((columnIntent: UniformResizeIntent, rowIntent: UniformResizeIntent) => {
    setStoredValue({
      width: resolveUniformColumnSize(columnIntent, constraints),
      height: resolveUniformRowSize(rowIntent, constraints),
      layoutSignature,
    });
  }, [constraints, layoutSignature, setStoredValue]);

  const handleReset = useCallback(() => {
    setStoredValue(undefined);
  }, [setStoredValue]);

  const hasOverrides = userCellWidth !== null || userCellHeight !== null;

  return useMemo(() => ({
    userCellWidth,
    userCellHeight,
    hasOverrides,
    previewColumnResize,
    previewRowResize,
    handleColumnResize,
    handleRowResize,
    handleSizeResize,
    handleReset,
  }), [
    userCellWidth,
    userCellHeight,
    hasOverrides,
    previewColumnResize,
    previewRowResize,
    handleColumnResize,
    handleRowResize,
    handleSizeResize,
    handleReset,
  ]);
}
