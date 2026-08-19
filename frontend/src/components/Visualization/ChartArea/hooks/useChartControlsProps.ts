// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useChartControlsProps – assembles the props for ChartControls.
 *
 * ChartControls has a ~30-prop surface. Owning the assembly here keeps
 * ChartArea a thin wiring layer and keeps every handler a stable useCallback
 * (no inline lambdas in JSX), so ChartControls' React.memo actually holds.
 */

import { useMemo } from 'react';
import { useVisualizationContext, useChannels } from '../../../../contexts/VisualizationContext';
import { useDataSource } from '../../../../contexts/DataSourceContext';
import { useSheetContext } from '../../../../contexts/SheetContext';
import { useUndoRedo } from '../../../../hooks/useUndoRedo';
import { useChartActions } from './useChartActions';
import { useTableRowsToggle } from './useTableRowsToggle';
import type { ChartControlsProps } from '../components/ChartControls';
import type { useTableRowsQuery } from './useTableRowsQuery';

interface UseChartControlsPropsParams {
  isDebugOpen: boolean;
  onToggleDebug: () => void;
  debugUiEnabled: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isFullscreenSupported: boolean;
  onZoomOut: () => void;
  onZoomReset: () => void;
  hasActiveZoomFilters: boolean;
  tableRowsData: Pick<ReturnType<typeof useTableRowsQuery>, 'totalRows' | 'columns'>;
}

export function useChartControlsProps({
  isDebugOpen,
  onToggleDebug,
  debugUiEnabled,
  isFullscreen,
  onToggleFullscreen,
  isFullscreenSupported,
  onZoomOut,
  onZoomReset,
  hasActiveZoomFilters,
  tableRowsData,
}: UseChartControlsPropsParams): ChartControlsProps {
  const { state, dispatch, getUndoableSnapshot } = useVisualizationContext();
  const channels = useChannels();
  const { undo, completeUndo, redo, completeRedo, canUndo, canRedo } = useUndoRedo();
  const { resetWorkspace } = useSheetContext();
  const { dataSource, clearSessionFilters } = useDataSource();

  const {
    handleResetWorkspace,
    handleSwapAxis,
    handleUndo,
    handleRedo,
    handleIndependentXAxisToggle,
    handleIndependentYAxisToggle,
    handleForceRefresh,
    handleUpdateOptimizationSettings,
    handleBandThicknessScaleChange,
    handleToggleChartCaption,
  } = useChartActions({
    dispatch,
    getUndoableSnapshot,
    undo,
    completeUndo,
    redo,
    completeRedo,
    resetWorkspace,
    clearSessionFilters,
    bandThicknessScale: channels.size.bandThicknessScale,
    selectedTable: dataSource.selectedTable,
    selectedDatabase: dataSource.selectedDatabase,
  });

  const handleToggleTableRows = useTableRowsToggle();

  const {
    independentDomains,
    optimizationSettings,
    showTableRows,
    showChartCaption,
    tableColumnFields,
  } = state;

  const datasetStatusOverride = useMemo(
    () =>
      showTableRows
        ? {
            rows: tableRowsData.totalRows,
            cols: tableRowsData.columns.length || tableColumnFields.length,
          }
        : undefined,
    [showTableRows, tableRowsData, tableColumnFields],
  );

  return {
    isDebugOpen,
    onToggleDebug,
    debugUiEnabled,
    isFullscreen,
    onToggleFullscreen,
    isFullscreenSupported,
    onSwapAxis: handleSwapAxis,
    canUndo,
    canRedo,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onResetWorkspace: handleResetWorkspace,
    independentXAxis: !!independentDomains?.x,
    onToggleIndependentXAxis: handleIndependentXAxisToggle,
    independentYAxis: !!independentDomains?.y,
    onToggleIndependentYAxis: handleIndependentYAxisToggle,
    optimizationSettings,
    onUpdateOptimizationSettings: handleUpdateOptimizationSettings,
    onForceRefresh: handleForceRefresh,
    bandThicknessScale: channels.size.bandThicknessScale,
    onBandThicknessScaleChange: handleBandThicknessScaleChange,
    onZoomOut,
    onZoomReset,
    hasActiveZoomFilters,
    showTableRows,
    onToggleTableRows: handleToggleTableRows,
    showChartCaption,
    onToggleChartCaption: handleToggleChartCaption,
    datasetStatusOverride,
  };
}
