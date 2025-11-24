import React, { useEffect, useRef } from 'react';

import { QueryResult } from '../../../types';
import { PlotResult } from '../../../observable-plot-generator/types';
import styles from './ChartGrid.module.css';
import { useCellSizeOverrides } from './hooks/useCellSizeOverrides';
import { useStabilization } from './hooks/useStabilization';
import { useRowHeightCalculation } from './hooks/useRowHeightCalculation';
import { useContainerDimensions } from './hooks/useContainerDimensions';
import { useScrollSync } from './hooks/useScrollSync';
import { useChartGridLayout } from './hooks/useChartGridLayout';
import { MultiPlotGrid } from './MultiPlotGrid';

interface ChartGridProps {
  spec: PlotResult | null;
  data: QueryResult | null;
  onPlotRenderComplete?: (plotId: string) => void;
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
 */
const ChartGrid: React.FC<ChartGridProps> = ({ spec, data, onPlotRenderComplete }) => {
  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const vScrollRef = useRef<HTMLDivElement>(null);
  const plotsTranslateRef = useRef<HTMLDivElement>(null);
  const plotGridRef = useRef<HTMLDivElement>(null);

  // Derived values
  const hasMultiPlot = (spec?.plots?.length ?? 0) > 1;
  const rowsForSizing = spec?.layout?.rows ?? 1;

  // Custom hooks for state management
  const stabilization = useStabilization(spec, containerRef);
  const cellSizeOverrides = useCellSizeOverrides(spec);
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
    hasMultiPlot
  );
  const layoutCalcs = useChartGridLayout(
    spec,
    cellSizeOverrides.userCellWidth,
    cellSizeOverrides.userCellHeight,
    rowHeightPx,
    vScrollRef
  );

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
  if (!spec) {
    return (
      <div className={styles.container} ref={containerRef}>
        <p>No chart data available.</p>
      </div>
    );
  }

  // Handle multi-plot scenarios (grid / horizontal / vertical)
  if (layoutCalcs) {
    return (
      <MultiPlotGrid
        spec={spec}
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
      />
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
  return prevProps.spec === nextProps.spec && prevProps.data === nextProps.data;
});
