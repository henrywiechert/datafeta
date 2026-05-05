import React, { useEffect, useRef, useDeferredValue, useState, useCallback, useMemo } from 'react';
import { Menu, MenuItem } from '@mui/material';

import { QueryResult } from '../../../types';
import { GridResultModel } from '../../../observable-plot-generator/gridModel';
import {
  HORIZONTAL_SCROLLBAR_GUTTER_PX,
  VERTICAL_SCROLLBAR_GUTTER_PX,
  X_LABEL_ROW_PX,
} from '../../../config/chartLayoutConfig';
import FacetZoomDialog from './FacetZoomDialog';
import styles from './ChartGrid.module.css';
import { CellSizeOverrides } from './hooks/useCellSizeOverrides';
import { useStabilization } from './hooks/useStabilization';
import { useRowHeightCalculation } from './hooks/useRowHeightCalculation';
import { useContainerDimensions } from './hooks/useContainerDimensions';
import { useScrollSync } from './hooks/useScrollSync';
import { useChartGridLayout } from './hooks/useChartGridLayout';
import { MultiPlotGrid } from './MultiPlotGrid';
import { PlotBrushEvent } from './PlotArea';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';

/** Gantt zoom range representing the visible data range on the timeline axis */
export interface GanttZoomRange {
  min: number;
  max: number;
}

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

interface ChartGridProps {
  grid: GridResultModel | null;
  data: QueryResult | null;
  cellSizeOverrides: CellSizeOverrides;
  onPlotRenderComplete?: (plotId: string) => void;
  onAutoCategoryTickMeasure?: (sizes: { xHeightPx: number; yWidthPx: number }) => void;
  /** Whether the current chart is a Gantt chart (enables WASD keyboard navigation) */
  isGanttChart?: boolean;
  /** Current Gantt zoom range (null = full data range) */
  ganttZoomRange?: GanttZoomRange | null;
  /** Callback when zoom range changes via WASD keys */
  onGanttZoomRangeChange?: (range: GanttZoomRange | null) => void;
  /** Full data range for Gantt chart (needed for zoom calculations) */
  ganttFullDataRange?: GanttZoomRange | null;
  brushDisabled?: boolean;
  onBrushEnd?: (event: PlotBrushEvent) => void;
  onHeatmapSizeToolbarChange?: (toolbarState: HeatmapSizeToolbarState | null) => void;
}

/**
 * ChartGrid - Renders Observable Plot charts (single or multiple)
 *
 * This component orchestrates the rendering of faceted chart grids using a
 * three-layer scrolling architecture. See MultiPlotGrid for implementation details.
 *
 * The component uses extracted hooks for:
 * - Layout calculations (useChartGridLayout)
 * - Scroll synchronization (useScrollSync)
 * - Render stabilization (useStabilization)
 * - Row height calculation (useRowHeightCalculation)
 * - Container dimension tracking (useContainerDimensions)
 * - User cell size overrides (useCellSizeOverrides)
 *
 * IMPORTANT: Uses useDeferredValue to prevent intermediate "half-ready" renders
 * when faceting changes due to filter updates. This ensures React keeps showing
 * the old grid until the new one is fully ready.
 */
const ChartGrid: React.FC<ChartGridProps> = ({
  grid: gridProp,
  data,
  cellSizeOverrides,
  onPlotRenderComplete,
  onAutoCategoryTickMeasure,
  isGanttChart = false,
  ganttZoomRange = null,
  onGanttZoomRangeChange,
  ganttFullDataRange = null,
  brushDisabled,
  onBrushEnd,
  onHeatmapSizeToolbarChange,
}) => {
  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const vScrollRef = useRef<HTMLDivElement>(null);
  const plotsTranslateRef = useRef<HTMLDivElement>(null);
  const plotGridRef = useRef<HTMLDivElement>(null);

  // Get label styles from context
  const { state } = useVisualizationContext();
  const { axisLabelStyles, facetLabelStyles, categoryTickStyles, globalChartType } = state;
  const {
    userCellWidth,
    userCellHeight,
    hasOverrides,
    handleColumnResize,
    handleRowResize,
    handleReset,
  } = cellSizeOverrides;

  // Use deferred value to prevent intermediate renders during faceting transitions.
  // When the grid changes (e.g., filter changes faceting from 30 rows to 3 rows),
  // React will keep showing the old grid while preparing the new one.
  // This eliminates the "animation" effect of partially-ready grids.
  const grid = useDeferredValue(gridProp);

  // Track if we're in a transition (showing stale content)
  const isTransitioning = gridProp !== grid;

  // Note: We use MultiPlotGrid architecture for any number of plots (including single plots)
  // so scroll handlers must be attached whenever we have plots, not just when count > 1
  const usesGridLayout = (grid?.cells.length ?? 0) >= 1;
  const rowsForSizing = grid?.layout.rows ?? 1;

  // Custom hooks for state management
  const stabilization = useStabilization(grid, containerRef);
  const rowHeightPx = useRowHeightCalculation(
    vScrollRef,
    rowsForSizing,
    containerRef,
    stabilization.pendingRowHeightRef,
    stabilization.isStabilizing
  );
  const containerDimensions = useContainerDimensions(containerRef);
  const scrollSync = useScrollSync(
    hScrollRef,
    vScrollRef,
    plotsTranslateRef,
    containerRef,
    usesGridLayout,
    isGanttChart,
    ganttZoomRange,
    onGanttZoomRangeChange,
    ganttFullDataRange
  );
  const layoutCalcs = useChartGridLayout(
    grid,
    userCellWidth,
    userCellHeight,
    rowHeightPx,
    vScrollRef,
    axisLabelStyles.yAxis,
    facetLabelStyles,
    categoryTickStyles
  );

  // Facet zoom state (must be before any conditional returns — Rules of Hooks)
  const [contextMenu, setContextMenu] = useState<{ plotId: string; x: number; y: number } | null>(null);
  const [zoomedPlotId, setZoomedPlotId] = useState<string | null>(null);

  const handleCellContextMenu = useCallback((plotId: string, clientX: number, clientY: number) => {
    setContextMenu({ plotId, x: clientX, y: clientY });
  }, []);

  const handleZoomOpen = useCallback(() => {
    if (contextMenu) {
      setZoomedPlotId(contextMenu.plotId);
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleMenuClose = useCallback(() => setContextMenu(null), []);
  const handleZoomClose = useCallback(() => setZoomedPlotId(null), []);

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

  const heatmapToolbarState = useMemo<HeatmapSizeToolbarState | null>(() => {
    if (globalChartType !== 'heatmap' || !layoutCalcs) return null;

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
    globalChartType,
    layoutCalcs,
    currentColumnWidth,
    currentRowHeight,
    hasOverrides,
    handleReset,
    decreaseColumnWidth,
    increaseColumnWidth,
    decreaseRowHeight,
    increaseRowHeight,
    fitToView,
  ]);

  // Sync state with calculated height (for ResizeObserver to use as baseline)
  useEffect(() => {
    if (layoutCalcs && layoutCalcs.calculatedRowHeightPx !== rowHeightPx) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChartGrid] Syncing state with calculated rowHeight:', rowHeightPx, '→', layoutCalcs.calculatedRowHeightPx);
      }
    }
  }, [layoutCalcs, rowHeightPx]);

  useEffect(() => {
    if (!layoutCalcs || !onAutoCategoryTickMeasure) return;
    onAutoCategoryTickMeasure({
      xHeightPx: layoutCalcs.dynamicXAxisPx,
      yWidthPx: layoutCalcs.dynamicYAxisPx,
    });
  }, [layoutCalcs, onAutoCategoryTickMeasure]);

  useEffect(() => {
    onHeatmapSizeToolbarChange?.(heatmapToolbarState);
  }, [heatmapToolbarState, onHeatmapSizeToolbarChange]);

  useEffect(() => {
    return () => {
      onHeatmapSizeToolbarChange?.(null);
    };
  }, [onHeatmapSizeToolbarChange]);

  // Handle null or missing grid
  if (!grid) {
    return (
      <div className={styles.container} ref={containerRef}>
        <p>No chart data available.</p>
      </div>
    );
  }

  // Handle multi-plot scenarios (grid / horizontal / vertical)
  if (layoutCalcs) {
    return (
      <>
        <MultiPlotGrid
          grid={grid}
          layoutCalcs={layoutCalcs}
          scrollSync={scrollSync}
          containerDimensions={containerDimensions}
          cellSizeOverrides={cellSizeOverrides}
          refs={{
            containerRef,
            hScrollRef,
            vScrollRef,
            plotsTranslateRef,
            plotGridRef,
          }}
          onPlotRenderComplete={onPlotRenderComplete}
          isTransitioning={isTransitioning}
          brushDisabled={brushDisabled}
          onBrushEnd={onBrushEnd}
          onCellContextMenu={handleCellContextMenu}
        />
        <Menu
          open={contextMenu !== null}
          onClose={handleMenuClose}
          anchorReference="anchorPosition"
          anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
        >
          <MenuItem onClick={handleZoomOpen}>Zoom facet</MenuItem>
        </Menu>
        {zoomedPlotId !== null && (
          <FacetZoomDialog grid={grid} plotId={zoomedPlotId} onClose={handleZoomClose} />
        )}
      </>
    );
  }

  // Fallback: no plots available
  return (
    <div className={styles.container} ref={containerRef}>
      <p>No chart data available</p>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders when only unrelated state changes.
// All callback props are useCallback-stable in ChartArea, so referential
// equality is sufficient.
export default React.memo(ChartGrid, (prevProps, nextProps) => {
  return (
    prevProps.grid === nextProps.grid &&
    prevProps.data === nextProps.data &&
    prevProps.cellSizeOverrides === nextProps.cellSizeOverrides &&
    prevProps.onAutoCategoryTickMeasure === nextProps.onAutoCategoryTickMeasure &&
    prevProps.isGanttChart === nextProps.isGanttChart &&
    prevProps.ganttZoomRange === nextProps.ganttZoomRange &&
    prevProps.ganttFullDataRange === nextProps.ganttFullDataRange &&
    prevProps.brushDisabled === nextProps.brushDisabled &&
    prevProps.onPlotRenderComplete === nextProps.onPlotRenderComplete &&
    prevProps.onGanttZoomRangeChange === nextProps.onGanttZoomRangeChange &&
    prevProps.onBrushEnd === nextProps.onBrushEnd &&
    prevProps.onHeatmapSizeToolbarChange === nextProps.onHeatmapSizeToolbarChange
  );
});
