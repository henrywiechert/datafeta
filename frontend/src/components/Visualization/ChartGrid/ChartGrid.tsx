// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useRef, useDeferredValue, useState, useCallback } from 'react';
import { Menu, MenuItem } from '@mui/material';

import { GridResultModel } from '../../../observable-plot-generator/gridModel';
import FacetZoomDialog from './FacetZoomDialog';
import styles from './ChartGrid.module.css';
import { CellSizeOverrides } from './hooks/useCellSizeOverrides';
import { HeatmapSizeToolbarState, useHeatmapSizeToolbar } from './hooks/useHeatmapSizeToolbar';
import { useStabilization } from './hooks/useStabilization';
import { useRowHeightCalculation } from './hooks/useRowHeightCalculation';
import { useContainerDimensions } from './hooks/useContainerDimensions';
import { useScrollSync } from './hooks/useScrollSync';
import { useChartGridLayout } from './hooks/useChartGridLayout';
import { MultiPlotGrid } from './MultiPlotGrid';
import { PlotBrushEvent } from './PlotArea';
import { AxisLabelStyles, CategoryTickStyles, FacetLabelStyles } from '../../../contexts/VisualizationContext/types';
import { UserChartType, MapViewBounds } from '../../../types';

/** Gantt zoom range representing the visible data range on the timeline axis */
export interface GanttZoomRange {
  min: number;
  max: number;
}

/** Gantt-specific configuration, grouped to keep the ChartGrid prop surface flat. */
export interface ChartGridGanttProps {
  /** Whether the current chart is a Gantt chart (enables WASD keyboard navigation) */
  isGanttChart?: boolean;
  /** Current Gantt zoom range (null = full data range) */
  zoomRange?: GanttZoomRange | null;
  /** Callback when zoom range changes via WASD keys */
  onZoomRangeChange?: (range: GanttZoomRange | null) => void;
  /** Full data range for Gantt chart (needed for zoom calculations) */
  fullDataRange?: GanttZoomRange | null;
}

/** Brush (range-select) configuration, grouped to keep the prop surface flat. */
export interface ChartGridBrushProps {
  disabled?: boolean;
  onBrushEnd?: (event: PlotBrushEvent) => void;
}

/** Map pan/zoom navigation (transient view state; no filter side effects). */
export interface ChartGridMapProps {
  enabled?: boolean;
  onViewChange?: (plotId: string, bounds: MapViewBounds) => void;
  onViewReset?: (plotId: string) => void;
  onHoverChange?: (plotId: string | null) => void;
}

/**
 * Label/style state lifted from VisualizationContext to props. Reading via context
 * inside this memoized component would bypass the memo on every reducer tick.
 */
export interface ChartGridLabelStyles {
  axisLabelStyles: AxisLabelStyles;
  facetLabelStyles: FacetLabelStyles;
  categoryTickStyles: CategoryTickStyles;
}

interface ChartGridProps {
  grid: GridResultModel | null;
  cellSizeOverrides: CellSizeOverrides;
  onPlotRenderComplete?: (plotId: string) => void;
  onAutoCategoryTickMeasure?: (sizes: { xHeightPx: number; yWidthPx: number }) => void;
  onHeatmapSizeToolbarChange?: (toolbarState: HeatmapSizeToolbarState | null) => void;
  globalChartType: UserChartType | null;
  /** Gantt-specific configuration (omit for non-Gantt charts). */
  gantt?: ChartGridGanttProps;
  /** Brush selection configuration. */
  brush?: ChartGridBrushProps;
  /** Map navigation configuration. */
  map?: ChartGridMapProps;
  /** Axis / facet / category label styling. */
  labelStyles: ChartGridLabelStyles;
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
  cellSizeOverrides,
  onPlotRenderComplete,
  onAutoCategoryTickMeasure,
  onHeatmapSizeToolbarChange,
  globalChartType,
  gantt,
  brush,
  map,
  labelStyles,
}) => {
  const {
    isGanttChart = false,
    zoomRange: ganttZoomRange = null,
    onZoomRangeChange: onGanttZoomRangeChange,
    fullDataRange: ganttFullDataRange = null,
  } = gantt ?? {};
  const { disabled: brushDisabled, onBrushEnd } = brush ?? {};
  const {
    enabled: mapNavEnabled = false,
    onViewChange: onMapViewChange,
    onViewReset: onMapViewReset,
    onHoverChange: onMapHoverChange,
  } = map ?? {};
  const { axisLabelStyles, facetLabelStyles, categoryTickStyles } = labelStyles;

  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const vScrollRef = useRef<HTMLDivElement>(null);
  const plotsTranslateRef = useRef<HTMLDivElement>(null);
  const plotGridRef = useRef<HTMLDivElement>(null);

  const { userCellWidth, userCellHeight } = cellSizeOverrides;

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
  const containerDimensions = useContainerDimensions(containerRef, stabilization.isStabilizing);
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
    categoryTickStyles,
    globalChartType,
  );

  const mapPanZoomHandlers = React.useMemo(() => {
    if (!mapNavEnabled || !onMapViewChange || !onMapViewReset) return undefined;
    return {
      onViewChange: onMapViewChange,
      onViewReset: onMapViewReset,
      onHoverChange: onMapHoverChange,
    };
  }, [mapNavEnabled, onMapViewChange, onMapViewReset, onMapHoverChange]);

  // Facet zoom state (must be before any conditional returns — Rules of Hooks)
  const [contextMenu, setContextMenu] = useState<{ plotId: string; x: number; y: number } | null>(null);
  const [zoomedPlotId, setZoomedPlotId] = useState<string | null>(null);
  const [autoExpandPinnedComparison, setAutoExpandPinnedComparison] = useState(false);

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

  const heatmapToolbarState = useHeatmapSizeToolbar({
    enabled: globalChartType === 'heatmap',
    grid,
    layoutCalcs,
    containerDimensions,
    cellSizeOverrides,
  });

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
          mapPanZoom={mapPanZoomHandlers}
          onCellContextMenu={handleCellContextMenu}
          autoExpandPinnedComparison={autoExpandPinnedComparison}
          onAutoExpandPinnedComparisonChange={setAutoExpandPinnedComparison}
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
          <FacetZoomDialog
            grid={grid}
            plotId={zoomedPlotId}
            onClose={handleZoomClose}
            mapPanZoom={mapPanZoomHandlers}
            autoExpandPinnedComparison={autoExpandPinnedComparison}
            onAutoExpandPinnedComparisonChange={setAutoExpandPinnedComparison}
          />
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
// equality is sufficient. The grouped props (gantt/brush/labelStyles) are
// compared field-by-field so the memo stays effective even if the parent
// passes freshly-constructed wrapper objects.
export default React.memo(ChartGrid, (prevProps, nextProps) => {
  return (
    prevProps.grid === nextProps.grid &&
    prevProps.cellSizeOverrides === nextProps.cellSizeOverrides &&
    prevProps.onAutoCategoryTickMeasure === nextProps.onAutoCategoryTickMeasure &&
    prevProps.onPlotRenderComplete === nextProps.onPlotRenderComplete &&
    prevProps.onHeatmapSizeToolbarChange === nextProps.onHeatmapSizeToolbarChange &&
    prevProps.globalChartType === nextProps.globalChartType &&
    prevProps.gantt?.isGanttChart === nextProps.gantt?.isGanttChart &&
    prevProps.gantt?.zoomRange === nextProps.gantt?.zoomRange &&
    prevProps.gantt?.fullDataRange === nextProps.gantt?.fullDataRange &&
    prevProps.gantt?.onZoomRangeChange === nextProps.gantt?.onZoomRangeChange &&
    prevProps.brush?.disabled === nextProps.brush?.disabled &&
    prevProps.brush?.onBrushEnd === nextProps.brush?.onBrushEnd &&
    prevProps.map?.enabled === nextProps.map?.enabled &&
    prevProps.map?.onViewChange === nextProps.map?.onViewChange &&
    prevProps.map?.onViewReset === nextProps.map?.onViewReset &&
    prevProps.map?.onHoverChange === nextProps.map?.onHoverChange &&
    prevProps.labelStyles.axisLabelStyles === nextProps.labelStyles.axisLabelStyles &&
    prevProps.labelStyles.facetLabelStyles === nextProps.labelStyles.facetLabelStyles &&
    prevProps.labelStyles.categoryTickStyles === nextProps.labelStyles.categoryTickStyles
  );
});
