import React, { RefObject, useState, useCallback } from 'react';
import {
  GridResultModel,
  getPlotGridCellAtRow,
  hasFacetHeaders,
  usesOnlyAxislessRenderers,
} from '../../../observable-plot-generator/gridModel';
import {
  GRID_DIVIDER_COLOR,
  HORIZONTAL_SCROLLBAR_GUTTER_PX,
  MIN_GRID_ROW_PX,
  VERTICAL_SCROLLBAR_GUTTER_PX,
  X_LABEL_ROW_PX,
} from '../../../config/chartLayoutConfig';
import { LayoutCalculations } from './hooks/useChartGridLayout';
import { ScrollSyncState } from './hooks/useScrollSync';
import { Dimensions } from './hooks/useContainerDimensions';
import { CellSizeOverrides } from './hooks/useCellSizeOverrides';
import PlotArea, { PlotBrushEvent } from './PlotArea';
import XAxes from './XAxes';
import YAxes from './YAxes';
import { TopFacetLabels, LeftFacetLabels } from './FacetLabels';
import GridResizeOverlay from './GridResizeOverlay';
import GridResizeHandle from './GridResizeHandle';
import AxisLabel from './AxisLabel';
import AxisLabelStylePopover from './AxisLabelStylePopover';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { YAxisLabelStyle } from '../../../contexts/VisualizationContext/types';
import { buildPlotGridSizingStyle } from './utils/layoutUtils';
import {
  getFacetColumnSizeConstraints,
  getFacetRowSizeConstraints,
  resolveFacetTrackSize,
} from './utils/uniformCellSizing';
import styles from './ChartGrid.module.css';

interface MultiPlotGridProps {
  grid: GridResultModel;
  layoutCalcs: LayoutCalculations;
  scrollSync: ScrollSyncState;
  containerDimensions: Dimensions;
  cellSizeOverrides: CellSizeOverrides;
  refs: {
    containerRef: RefObject<HTMLDivElement>;
    hScrollRef: RefObject<HTMLDivElement>;
    vScrollRef: RefObject<HTMLDivElement>;
    plotsTranslateRef: RefObject<HTMLDivElement>;
    plotGridRef: RefObject<HTMLDivElement>;
  };
  onPlotRenderComplete?: (plotId: string) => void;
  /** True when we're showing stale content during a deferred transition */
  isTransitioning?: boolean;
  brushDisabled?: boolean;
  onBrushEnd?: (event: PlotBrushEvent) => void;
  onCellContextMenu?: (plotId: string, clientX: number, clientY: number) => void;
}

/**
 * MultiPlotGrid - Renders the three-layer scrolling architecture for faceted charts
 *
 * ARCHITECTURE: Three-Layer Scrolling System
 *
 * LAYER 1: HORIZONTAL SCROLL (z-index: 3)
 * - Top facet headers (column labels)
 * - Main plots area (synced with vertical scroll)
 * - Bottom X-axes
 *
 * LAYER 2: VERTICAL SCROLL (z-index: 2)
 * - Left Y-axes and labels
 * - Transparent sizing divs
 *
 * LAYER 3: PLOT GRID (inside Layer 1's plot area)
 * - Actual CSS Grid with faceted charts
 */
export const MultiPlotGrid: React.FC<MultiPlotGridProps> = ({
  grid,
  layoutCalcs,
  scrollSync,
  containerDimensions,
  cellSizeOverrides,
  refs,
  onPlotRenderComplete,
  isTransitioning = false,
  brushDisabled,
  onBrushEnd,
  onCellContextMenu,
}) => {
  const {
    columns,
    rows,
    plotTemplateColumns,
    totalContentWidthPx,
    plotRowsSpec,
    actualRowHeights,
    hasRowFacets,
    baseCols,
    baseRows,
    leftLabelsPx,
    dynamicYAxisPx,
    dynamicXAxisPx,
    yLabelColPx,
    leftFixedWidthPx,
    topHeaderHeight,
    facetLeftHeaderPx,
    facetLeftValuesPx,
    facetTopValuesPx,
    facetLeftValueWidthsPx,
    facetTopValueHeightsPx,
  } = layoutCalcs;

  const { scrollOffsets, onWheelCapture, isKeyboardNavActive } = scrollSync;
  const { hasOverrides, handleReset } = cellSizeOverrides;
  const { containerRef, hScrollRef, vScrollRef, plotsTranslateRef, plotGridRef } = refs;

  const hideExternalAxes = usesOnlyAxislessRenderers(grid);
  const facetPresent = hasFacetHeaders(grid);
  const rowResizeHandleLength = hideExternalAxes ? Math.max(1, containerDimensions.width) : undefined;
  const columnResizeHandleLength = hideExternalAxes
    ? Math.max(1, containerDimensions.height - topHeaderHeight)
    : undefined;
  const bottomAxisBandPx = dynamicXAxisPx + X_LABEL_ROW_PX + HORIZONTAL_SCROLLBAR_GUTTER_PX;
  const plotBottomBoundaryPx = containerDimensions.height - bottomAxisBandPx;

  const { state, dispatch } = useVisualizationContext();
  const { axisLabelStyles } = state;
  const facetColumnConstraints = getFacetColumnSizeConstraints();
  const facetRowConstraints = getFacetRowSizeConstraints();

  const [yLabelPopoverAnchor, setYLabelPopoverAnchor] = useState<HTMLElement | null>(null);

  const handleYLabelClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    setYLabelPopoverAnchor(event.currentTarget);
  }, []);

  const handleYLabelPopoverClose = useCallback(() => {
    setYLabelPopoverAnchor(null);
  }, []);

  const handleYLabelStyleChange = useCallback((updates: Partial<YAxisLabelStyle>) => {
    dispatch({ type: 'SET_Y_AXIS_LABEL_STYLE', payload: updates });
  }, [dispatch]);

  const previewFacetColumnResize = useCallback((intent: { currentSize: number; delta: number }) => {
    return resolveFacetTrackSize(intent, facetColumnConstraints);
  }, [facetColumnConstraints]);

  const previewFacetRowResize = useCallback((intent: { currentSize: number; delta: number }) => {
    return resolveFacetTrackSize(intent, facetRowConstraints);
  }, [facetRowConstraints]);

  const handleFacetColumnResize = useCallback((depthIndex: number, intent: { currentSize: number; delta: number }) => {
    dispatch({
      type: 'SET_FACET_LEFT_VALUES_DEPTH_WIDTH',
      payload: {
        depthIndex,
        widthPx: resolveFacetTrackSize(intent, facetColumnConstraints),
      },
    });
  }, [dispatch, facetColumnConstraints]);

  const handleFacetRowResize = useCallback((depthIndex: number, intent: { currentSize: number; delta: number }) => {
    dispatch({
      type: 'SET_FACET_TOP_VALUES_DEPTH_HEIGHT',
      payload: {
        depthIndex,
        heightPx: resolveFacetTrackSize(intent, facetRowConstraints),
      },
    });
  }, [dispatch, facetRowConstraints]);

  const handleCategoryYWidthResize = useCallback((intent: { currentSize: number; delta: number }) => {
    dispatch({
      type: 'SET_CATEGORY_Y_WIDTH_PX',
      payload: Math.max(30, intent.currentSize + intent.delta),
    });
  }, [dispatch]);

  const handleCategoryXHeightResize = useCallback((intent: { currentSize: number; delta: number }) => {
    dispatch({
      type: 'SET_CATEGORY_X_HEIGHT_PX',
      payload: Math.max(24, intent.currentSize - intent.delta), // subtraction because negative delta (moving up) means larger height
    });
  }, [dispatch]);

  return (
    <div
      className={styles.container}
      ref={containerRef}
      style={{
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
        // During transitions, slightly dim the old content to indicate update in progress
        // This provides subtle visual feedback without causing layout shifts
        opacity: isTransitioning ? 0.5 : 1,
        transition: 'opacity 0.15s ease-out',
      }}
      onWheelCapture={(e) => onWheelCapture(e, leftFixedWidthPx)}
    >
      {/* ===============================================================
          LAYER 1: HORIZONTAL SCROLL (z-index: 3)
          Contains: top headers, plots (with vertical sync), bottom axes
          =============================================================== */}
      <div
        ref={hScrollRef}
        className={styles.horizontalScrollLayer}
        style={{
          position: 'absolute',
          top: 0,
          left: leftFixedWidthPx,
          right: VERTICAL_SCROLLBAR_GUTTER_PX,
          bottom: 0,
          overflowX: 'scroll',
          overflowY: 'hidden',
          zIndex: 3,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `minmax(0, 1fr)`,
            gridTemplateRows: facetPresent
              ? `${topHeaderHeight}px 1fr ${dynamicXAxisPx}px 0px`
              : `1fr ${dynamicXAxisPx}px 0px`,
            minWidth: `${totalContentWidthPx}px`,
            width: '100%',
            height: '100%',
          }}
        >
          {/* Top facet headers (if present) */}
          <TopFacetLabels
            grid={grid}
            plotTemplateColumns={plotTemplateColumns}
            baseCols={baseCols}
            facetTopValueHeightsPx={facetTopValueHeightsPx}
          />

          {/* ======================================================
              LAYER 3: PLOT GRID (inside this PlotArea component)
              The actual CSS Grid with faceted charts
              ====================================================== */}
          <PlotArea
            grid={grid}
            plotsTranslateRef={plotsTranslateRef}
            plotTemplateColumns={plotTemplateColumns}
            plotRowsSpec={plotRowsSpec}
            totalContentWidthPx={totalContentWidthPx}
            onPlotRenderComplete={onPlotRenderComplete}
            brushDisabled={brushDisabled}
            onBrushEnd={onBrushEnd}
            onCellContextMenu={onCellContextMenu}
          />

          {!hideExternalAxes && (
            <XAxes
              grid={grid}
              columns={columns}
              plotTemplateColumns={plotTemplateColumns}
              totalContentWidthPx={totalContentWidthPx}
              dynamicXAxisPx={dynamicXAxisPx}
            />
          )}
        </div>
      </div>

      {/* ===============================================================
          LAYER 2: VERTICAL SCROLL (z-index: 2)
          Contains: left Y-axes/labels, transparent sizing divs
          =============================================================== */}
      <div
        ref={vScrollRef}
        className={styles.verticalScrollLayer}
        style={{
          position: 'absolute',
          top: facetPresent ? topHeaderHeight : 0,
          left: 0,
          right: 0,
          bottom: bottomAxisBandPx,
          overflowY: 'scroll',
          overflowX: 'hidden',
          zIndex: 2,
          pointerEvents: 'auto',
        }}
      >
        <div
          className="vertical-scroll-content"
          style={{
            display: 'grid',
            gridTemplateColumns: `${leftFixedWidthPx}px 1fr`,
            gridTemplateRows: plotRowsSpec,
            pointerEvents: 'none',
          }}
        >
          {/* Left Y labels/scales area */}
          <div
            style={{
              gridColumn: 1,
              gridRow: '1 / -1',
              pointerEvents: 'auto',
              borderRight: `1px solid ${GRID_DIVIDER_COLOR}`,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: hasRowFacets
                  ? `${leftLabelsPx}px ${yLabelColPx}px ${dynamicYAxisPx}px`
                  : `${yLabelColPx}px ${dynamicYAxisPx}px`,
                gridTemplateRows: plotRowsSpec,
              }}
            >
              {/* Left facet labels area */}
              <LeftFacetLabels
                grid={grid}
                plotRowsSpec={plotRowsSpec}
                baseRows={baseRows}
                facetLeftHeaderPx={facetLeftHeaderPx}
                facetLeftValueWidthsPx={facetLeftValueWidthsPx}
              />

              {/* Y-axis vertical labels column */}
              {Array.from({ length: rows }).map((_, r) => {
                const sample = getPlotGridCellAtRow(grid, r);
                const yOpts: any = sample?.content.options?.y || {};
                const yLabel = yOpts?.label as string | undefined;
                return (
                  <div
                    key={`y-label-${r}`}
                    style={{
                      gridColumn: hasRowFacets ? 2 : 1,
                      gridRow: r + 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      margin: 0,
                      borderBottom: `1px solid ${GRID_DIVIDER_COLOR}`,
                    }}
                  >
                    <AxisLabel
                      label={yLabel || ''}
                      axis="y"
                      style={axisLabelStyles.yAxis}
                      onClick={handleYLabelClick}
                    />
                  </div>
                );
              })}

          {!hideExternalAxes && (
            <YAxes
              grid={grid}
              rows={rows}
              dynamicYAxisPx={dynamicYAxisPx}
              rowHeights={actualRowHeights}
              hasRowFacets={hasRowFacets}
            />
          )}
            </div>
          </div>

          {/* Plots area (transparent, just for scrolling) */}
          <div style={{ gridColumn: 2, gridRow: 1, pointerEvents: 'none' }}>
            <div
              ref={plotGridRef}
              style={{
                ...buildPlotGridSizingStyle({
                  plotTemplateColumns,
                  plotRowsSpec,
                  totalContentWidthPx,
                  columnSizes: grid.layout?.columnSizes,
                }),
                opacity: 0,
                pointerEvents: 'none',
              }}
            >
              {grid.cells.map((cell, index) => {
                const key = cell.id || String(index);
                const pos = cell.position;
                const gridItemStyle: React.CSSProperties = {
                  gridColumn: pos.col + 1,
                  gridRow: pos.row + 1,
                };
                return (
                  <div
                    key={`vertical-${key}`}
                    style={{ ...gridItemStyle, minHeight: `${MIN_GRID_ROW_PX}px` }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: `${plotBottomBoundaryPx - 1}px`,
          left: `${leftFixedWidthPx}px`,
          right: `${VERTICAL_SCROLLBAR_GUTTER_PX}px`,
          height: '1px',
          backgroundColor: GRID_DIVIDER_COLOR,
          pointerEvents: 'none',
          zIndex: 99,
        }}
      />

      {/* Grid Resize Overlay - handles positioned on gridlines in axis areas */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 100,
        }}
      >
        <GridResizeHandle
          orientation="vertical"
          position={leftFixedWidthPx}
          length={containerDimensions.height - dynamicXAxisPx}
          onResizeEnd={(delta) => handleCategoryYWidthResize({ currentSize: dynamicYAxisPx, delta })}
          isInAxisArea={true}
        />
        <GridResizeHandle
          orientation="horizontal"
          position={plotBottomBoundaryPx}
          length={containerDimensions.width - leftFixedWidthPx}
          crossAxisOffset={leftFixedWidthPx}
          onResizeEnd={(delta) => handleCategoryXHeightResize({ currentSize: dynamicXAxisPx, delta })}
          isInAxisArea={true}
        />
        <GridResizeOverlay
          columns={columns}
          rows={rows}
          columnTemplate={plotTemplateColumns}
          rowTemplate={plotRowsSpec}
          leftFixedWidth={leftFixedWidthPx}
          bottomFixedHeight={dynamicXAxisPx}
          topHeaderHeight={topHeaderHeight}
          rowHandleLength={rowResizeHandleLength}
          columnHandleLength={columnResizeHandleLength}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          horizontalScrollOffset={scrollOffsets.horizontal}
          verticalScrollOffset={scrollOffsets.vertical}
          plotGridRef={plotGridRef}
          previewColumnResize={cellSizeOverrides.previewColumnResize}
          previewRowResize={cellSizeOverrides.previewRowResize}
          onColumnResize={cellSizeOverrides.handleColumnResize}
          onRowResize={cellSizeOverrides.handleRowResize}
          facetLeftHeaderPx={facetLeftHeaderPx}
          facetLeftValueWidthsPx={facetLeftValueWidthsPx}
          facetTopValueHeightsPx={facetTopValueHeightsPx}
          previewFacetColumnResize={previewFacetColumnResize}
          previewFacetRowResize={previewFacetRowResize}
          onFacetColumnResize={handleFacetColumnResize}
          onFacetRowResize={handleFacetRowResize}
        />
      </div>

      {/* Reset button for cell size overrides */}
      {hasOverrides && (
        <button
          onClick={handleReset}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 300,
            padding: '6px 12px',
            backgroundColor: '#f8f8f8',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            color: '#333',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            transition: 'all 0.15s ease',
            pointerEvents: 'auto',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e8e8e8';
            e.currentTarget.style.borderColor = '#999';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#f8f8f8';
            e.currentTarget.style.borderColor = '#ccc';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          }}
          title="Reset grid to automatic sizing"
        >
          Reset Grid Size
        </button>
      )}

      {/* Keyboard navigation hint for Gantt charts */}
      <div
        className={`${styles.keyboardNavHint} ${isKeyboardNavActive ? styles.visible : ''}`}
      >
        <kbd>W</kbd>/<kbd>S</kbd> Zoom &nbsp; <kbd>A</kbd>/<kbd>D</kbd> Pan &nbsp; <kbd>R</kbd> Reset
      </div>

      {/* Y-axis label style popover */}
      <AxisLabelStylePopover
        anchorEl={yLabelPopoverAnchor}
        onClose={handleYLabelPopoverClose}
        axis="y"
        style={axisLabelStyles.yAxis}
        onChange={handleYLabelStyleChange}
      />
    </div>
  );
};
