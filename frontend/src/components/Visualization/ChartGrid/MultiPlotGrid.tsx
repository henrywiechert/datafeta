import React, { RefObject } from 'react';
import { PlotResult } from '../../../observable-plot-generator/types';
import { GRID_DIVIDER_COLOR, MIN_GRID_ROW_PX } from '../../../config/chartLayoutConfig';
import { LayoutCalculations } from './hooks/useChartGridLayout';
import { ScrollSyncState } from './hooks/useScrollSync';
import { Dimensions } from './hooks/useContainerDimensions';
import { CellSizeOverrides } from './hooks/useCellSizeOverrides';
import PlotArea from './PlotArea';
import XAxes from './XAxes';
import YAxes from './YAxes';
import { TopFacetLabels, LeftFacetLabels } from './FacetLabels';
import GridResizeOverlay from './GridResizeOverlay';
import styles from './ChartGrid.module.css';

interface MultiPlotGridProps {
  spec: PlotResult;
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
  spec,
  layoutCalcs,
  scrollSync,
  containerDimensions,
  cellSizeOverrides,
  refs,
  onPlotRenderComplete,
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
  } = layoutCalcs;

  const { scrollOffsets, onWheelCapture } = scrollSync;
  const { hasOverrides, handleReset } = cellSizeOverrides;
  const { containerRef, hScrollRef, vScrollRef, plotsTranslateRef, plotGridRef } = refs;

  return (
    <div
      className={styles.container}
      ref={containerRef}
      style={{ position: 'relative', height: '100%', overflow: 'hidden' }}
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
          right: 14, // Leave space for vertical scrollbar (14px wide)
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
            gridTemplateRows: spec.facetLabels
              ? `${topHeaderHeight}px 1fr ${dynamicXAxisPx}px 0px`
              : `1fr ${dynamicXAxisPx}px 0px`,
            minWidth: `${totalContentWidthPx}px`,
            width: '100%',
            height: '100%',
          }}
        >
          {/* Top facet headers (if present) */}
          <TopFacetLabels spec={spec} plotTemplateColumns={plotTemplateColumns} baseCols={baseCols} />

          {/* ======================================================
              LAYER 3: PLOT GRID (inside this PlotArea component)
              The actual CSS Grid with faceted charts
              ====================================================== */}
          <PlotArea
            spec={spec}
            plotsTranslateRef={plotsTranslateRef}
            plotTemplateColumns={plotTemplateColumns}
            plotRowsSpec={plotRowsSpec}
            totalContentWidthPx={totalContentWidthPx}
            onPlotRenderComplete={onPlotRenderComplete}
          />

          <XAxes
            spec={spec}
            columns={columns}
            plotTemplateColumns={plotTemplateColumns}
            totalContentWidthPx={totalContentWidthPx}
            dynamicXAxisPx={dynamicXAxisPx}
          />
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
          top: spec.facetLabels ? topHeaderHeight : 0,
          left: 0,
          right: 0,
          bottom: dynamicXAxisPx + 20 + 16, // X_LABEL_ROW_PX (20) + scrollbar
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
              <LeftFacetLabels spec={spec} plotRowsSpec={plotRowsSpec} baseRows={baseRows} />

              {/* Y-axis vertical labels column */}
              {Array.from({ length: rows }).map((_, r) => {
                const sample = (spec.plots || []).find((p) => p.position?.row === r);
                const yOpts: any = (sample as any)?.options?.y || {};
                const yLabel = yOpts?.label as string | undefined;
                const useVertical = true;
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
                    <div
                      style={{
                        writingMode: useVertical ? 'vertical-rl' : 'horizontal-tb',
                        transform: useVertical ? 'rotate(180deg)' : 'none',
                        textAlign: 'center',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        lineHeight: '1.2',
                      }}
                    >
                      {yLabel || ''}
                    </div>
                  </div>
                );
              })}

              <YAxes
                spec={spec}
                rows={rows}
                dynamicYAxisPx={dynamicYAxisPx}
                rowHeights={actualRowHeights}
                hasRowFacets={hasRowFacets}
              />
            </div>
          </div>

          {/* Plots area (transparent, just for scrolling) */}
          <div style={{ gridColumn: 2, gridRow: 1, pointerEvents: 'none' }}>
            <div
              ref={plotGridRef}
              style={{
                display: 'grid',
                gridTemplateColumns: plotTemplateColumns,
                gridTemplateRows: plotRowsSpec,
                minWidth: `${totalContentWidthPx}px`,
                opacity: 0,
                pointerEvents: 'none',
              }}
            >
              {(spec.plots || []).map((plot, index) => {
                const key = plot.id || String(index);
                const pos = plot.position;
                const gridItemStyle: React.CSSProperties | undefined = pos
                  ? { gridColumn: pos.col + 1, gridRow: pos.row + 1 }
                  : undefined;
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
        <GridResizeOverlay
          columns={columns}
          rows={rows}
          columnTemplate={plotTemplateColumns}
          rowTemplate={plotRowsSpec}
          leftFixedWidth={leftFixedWidthPx}
          bottomFixedHeight={dynamicXAxisPx}
          topHeaderHeight={topHeaderHeight}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          horizontalScrollOffset={scrollOffsets.horizontal}
          verticalScrollOffset={scrollOffsets.vertical}
          plotGridRef={plotGridRef}
          onColumnResize={cellSizeOverrides.handleColumnResize}
          onRowResize={cellSizeOverrides.handleRowResize}
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
    </div>
  );
};
