import React, { useEffect, useRef, useDeferredValue, useState, useCallback } from 'react';
import { Menu, MenuItem } from '@mui/material';

import { QueryResult } from '../../../types';
import { PlotResult } from '../../../observable-plot-generator/types';
import FacetZoomDialog from './FacetZoomDialog';
import styles from './ChartGrid.module.css';
import { useCellSizeOverrides } from './hooks/useCellSizeOverrides';
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

interface ChartGridProps {
  spec: PlotResult | null;
  data: QueryResult | null;
  onPlotRenderComplete?: (plotId: string) => void;
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
 * the old chart until the new spec is fully ready.
 */
const ChartGrid: React.FC<ChartGridProps> = ({
  spec,
  data,
  onPlotRenderComplete,
  isGanttChart = false,
  ganttZoomRange = null,
  onGanttZoomRangeChange,
  ganttFullDataRange = null,
  brushDisabled,
  onBrushEnd,
}) => {
  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const vScrollRef = useRef<HTMLDivElement>(null);
  const plotsTranslateRef = useRef<HTMLDivElement>(null);
  const plotGridRef = useRef<HTMLDivElement>(null);

  // Get label styles from context
  const { state } = useVisualizationContext();
  const { axisLabelStyles, facetLabelStyles } = state;

  // Use deferred value to prevent intermediate renders during faceting transitions.
  // When spec changes (e.g., filter changes faceting from 30 rows to 3 rows),
  // React will keep showing the old chart while preparing the new one.
  // This eliminates the "animation" effect of partially-ready specifications.
  const deferredSpec = useDeferredValue(spec);
  
  // Track if we're in a transition (showing stale content)
  const isTransitioning = spec !== deferredSpec;
  
  // Use the deferred spec for all layout calculations and rendering
  const activeSpec = deferredSpec;

  // Derived values
  // Note: We use MultiPlotGrid architecture for any number of plots (including single plots)
  // so scroll handlers must be attached whenever we have plots, not just when count > 1
  const usesGridLayout = (activeSpec?.plots?.length ?? 0) >= 1;
  const rowsForSizing = activeSpec?.layout?.rows ?? 1;

  // Custom hooks for state management
  // Use activeSpec (deferred) for stabilization to prevent unnecessary stabilization cycles
  const stabilization = useStabilization(activeSpec, containerRef);
  const cellSizeOverrides = useCellSizeOverrides(activeSpec);
  const rowHeightPx = useRowHeightCalculation(
    vScrollRef,
    rowsForSizing,
    containerRef,
    stabilization.pendingRowHeightRef
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
    activeSpec,
    cellSizeOverrides.userCellWidth,
    cellSizeOverrides.userCellHeight,
    rowHeightPx,
    vScrollRef,
    axisLabelStyles.yAxis,
    facetLabelStyles
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

  // Sync state with calculated height (for ResizeObserver to use as baseline)
  useEffect(() => {
    if (layoutCalcs && layoutCalcs.calculatedRowHeightPx !== rowHeightPx) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChartGrid] Syncing state with calculated rowHeight:', rowHeightPx, '→', layoutCalcs.calculatedRowHeightPx);
      }
      // Note: This update is handled by the rowHeightPx calculation itself
    }
  }, [layoutCalcs, rowHeightPx]);

  // Handle null or missing spec
  if (!activeSpec) {
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
          spec={activeSpec}
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
          <FacetZoomDialog spec={activeSpec} plotId={zoomedPlotId} onClose={handleZoomClose} />
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

// Memoize to prevent unnecessary re-renders when only unrelated state changes
export default React.memo(ChartGrid, (prevProps, nextProps) => {
  // Only re-render if spec or data actually changes
  // Use shallow comparison for spec and data references
  // Note: The useDeferredValue inside handles transition smoothly
  return (
    prevProps.spec === nextProps.spec &&
    prevProps.data === nextProps.data &&
    prevProps.isGanttChart === nextProps.isGanttChart &&
    prevProps.ganttZoomRange === nextProps.ganttZoomRange &&
    prevProps.ganttFullDataRange === nextProps.ganttFullDataRange &&
    prevProps.brushDisabled === nextProps.brushDisabled
  );
});
