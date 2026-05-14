// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useMemo } from 'react';
import {
  HORIZONTAL_SCROLLBAR_GUTTER_PX,
  VERTICAL_SCROLLBAR_GUTTER_PX,
  X_LABEL_ROW_PX,
} from '../../../../config/chartLayoutConfig';
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import { CellSizeOverrides } from './useCellSizeOverrides';
import { LayoutCalculations } from './useChartGridLayout';
import { Dimensions } from './useContainerDimensions';

export interface HeatmapSizeToolbarState {
  currentColumnWidth: number | null;
  currentRowHeight: number | null;
  canResize: boolean;
  hasOverrides: boolean;
  decreaseColumnWidth: () => void;
  increaseColumnWidth: () => void;
  decreaseRowHeight: () => void;
  increaseRowHeight: () => void;
  fitToView: () => void;
  reset: () => void;
}

const HEATMAP_SHRINK_FACTOR = 0.7;
const HEATMAP_GROW_FACTOR = 1.4;

interface UseHeatmapSizeToolbarArgs {
  enabled: boolean;
  grid: GridResultModel | null;
  layoutCalcs: LayoutCalculations | null;
  containerDimensions: Dimensions;
  cellSizeOverrides: CellSizeOverrides;
}

export function useHeatmapSizeToolbar({
  enabled,
  grid,
  layoutCalcs,
  containerDimensions,
  cellSizeOverrides,
}: UseHeatmapSizeToolbarArgs): HeatmapSizeToolbarState | null {
  const {
    userCellWidth,
    userCellHeight,
    hasOverrides,
    handleColumnResize,
    handleRowResize,
    handleReset,
  } = cellSizeOverrides;

  const currentColumnWidth = useMemo(() => {
    const columnSize = grid?.layout.columnSizes?.[0];
    const intrinsicWidth = typeof columnSize === 'number' ? columnSize : null;
    return userCellWidth ?? intrinsicWidth;
  }, [grid?.layout.columnSizes, userCellWidth]);

  const currentRowHeight = useMemo(() => {
    const rowSize = grid?.layout.rowSizes?.[0];
    const intrinsicHeight = typeof rowSize === 'number' ? rowSize : null;
    return userCellHeight ?? intrinsicHeight;
  }, [grid?.layout.rowSizes, userCellHeight]);

  const decreaseColumnWidth = useCallback(() => {
    if (currentColumnWidth === null) return;
    const nextSize = Math.round(currentColumnWidth * HEATMAP_SHRINK_FACTOR);
    handleColumnResize({
      currentSize: currentColumnWidth,
      delta: nextSize - currentColumnWidth,
    });
  }, [currentColumnWidth, handleColumnResize]);

  const increaseColumnWidth = useCallback(() => {
    if (currentColumnWidth === null) return;
    const nextSize = Math.round(currentColumnWidth * HEATMAP_GROW_FACTOR);
    handleColumnResize({
      currentSize: currentColumnWidth,
      delta: nextSize - currentColumnWidth,
    });
  }, [currentColumnWidth, handleColumnResize]);

  const decreaseRowHeight = useCallback(() => {
    if (currentRowHeight === null) return;
    const nextSize = Math.round(currentRowHeight * HEATMAP_SHRINK_FACTOR);
    handleRowResize({
      currentSize: currentRowHeight,
      delta: nextSize - currentRowHeight,
    });
  }, [currentRowHeight, handleRowResize]);

  const increaseRowHeight = useCallback(() => {
    if (currentRowHeight === null) return;
    const nextSize = Math.round(currentRowHeight * HEATMAP_GROW_FACTOR);
    handleRowResize({
      currentSize: currentRowHeight,
      delta: nextSize - currentRowHeight,
    });
  }, [currentRowHeight, handleRowResize]);

  const fitToView = useCallback(() => {
    if (!layoutCalcs || !grid || currentColumnWidth === null || currentRowHeight === null) return;
    if (layoutCalcs.columns <= 0 || layoutCalcs.rows <= 0) return;

    const bottomAxisBandPx = layoutCalcs.dynamicXAxisPx + X_LABEL_ROW_PX + HORIZONTAL_SCROLLBAR_GUTTER_PX;
    const plotBottomBoundaryPx = containerDimensions.height - bottomAxisBandPx;
    const availableContentWidth = Math.max(
      1,
      containerDimensions.width - layoutCalcs.leftFixedWidthPx - VERTICAL_SCROLLBAR_GUTTER_PX,
    );
    const availableContentHeight = Math.max(
      1,
      plotBottomBoundaryPx - (layoutCalcs.topHeaderHeight > 0 ? layoutCalcs.topHeaderHeight : 0),
    );

    const fitColumnWidth = Math.floor(availableContentWidth / layoutCalcs.columns);
    const fitRowHeight = Math.floor(availableContentHeight / layoutCalcs.rows);

    handleColumnResize({
      currentSize: currentColumnWidth,
      delta: fitColumnWidth - currentColumnWidth,
    });
    handleRowResize({
      currentSize: currentRowHeight,
      delta: fitRowHeight - currentRowHeight,
    });
  }, [
    containerDimensions.height,
    containerDimensions.width,
    currentColumnWidth,
    currentRowHeight,
    grid,
    layoutCalcs,
    handleColumnResize,
    handleRowResize,
  ]);

  return useMemo(() => {
    if (!enabled || !layoutCalcs) return null;

    return {
      currentColumnWidth,
      currentRowHeight,
      canResize: currentColumnWidth !== null && currentRowHeight !== null,
      hasOverrides,
      decreaseColumnWidth,
      increaseColumnWidth,
      decreaseRowHeight,
      increaseRowHeight,
      fitToView,
      reset: handleReset,
    };
  }, [
    enabled,
    layoutCalcs,
    currentColumnWidth,
    currentRowHeight,
    hasOverrides,
    decreaseColumnWidth,
    increaseColumnWidth,
    decreaseRowHeight,
    increaseRowHeight,
    fitToView,
    handleReset,
  ]);
}