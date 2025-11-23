import React, { useEffect, useRef, useState, useCallback } from 'react';

import { QueryResult } from '../../../types';
import { PlotResult } from '../../../observable-plot-generator/types';
import styles from './ChartGrid.module.css';
import { 
  MIN_GRID_COLUMN_PX, 
  MIN_GRID_ROW_PX,
  GRID_DIVIDER_COLOR,
  NAMES_BAND_LEFT_PX,
  VALUES_BAND_LEFT_PX,
  VALUES_BAND_TOP_PX,
  X_LABEL_ROW_PX
} from '../../../config/chartLayoutConfig';
import PlotArea from './PlotArea';
import XAxes from './XAxes';
import YAxes from './YAxes';
import { TopFacetLabels, LeftFacetLabels } from './FacetLabels';
import GridResizeOverlay from './GridResizeOverlay';

interface ChartGridProps {
  spec: PlotResult | null;
  data: QueryResult | null;
}

const TEXT_PX_PER_CHAR = 6; // conservative estimate for 12-14px font
const MIN_Y_AXIS_GUTTER_PX = 28;

function estimateTextPx(text?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length * TEXT_PX_PER_CHAR);
}

function computeDynamicYAxisGutterPx(spec: PlotResult, rows: number): number {
  let maxWidth = MIN_Y_AXIS_GUTTER_PX;
  const plots = spec.plots || [];
  for (let r = 0; r < rows; r++) {
    const sample = plots.find((p) => p.position?.row === r);
    const yOpts: any = (sample as any)?.options?.y || {};
    const yType = yOpts?.type;
    const yDomain = yOpts?.domain as any;
    let tickWidth = 0;
    if (yType === 'band' && Array.isArray(yDomain)) {
      // Categorical axis: estimate by longest label
      const longest = yDomain.reduce((m: number, v: any) => Math.max(m, estimateTextPx(String(v))), 0);
      tickWidth = longest + 10; // padding
    } else if (Array.isArray(yDomain) && yDomain.length === 2) {
      // Numeric axis: endpoints only (ticks are generated inside ObservablePlot)
      const [a, b] = yDomain;
      tickWidth = Math.max(estimateTextPx(String(a)), estimateTextPx(String(b))) + 6; // small padding
    }
    const rowWidth = Math.max(MIN_Y_AXIS_GUTTER_PX, tickWidth);
    if (rowWidth > maxWidth) maxWidth = rowWidth;
  }
  return maxWidth;
}

function computeDynamicXAxisGutterPx(spec: PlotResult, columns: number): number {
  let maxHeight = 24; // baseline
  const plots = spec.plots || [];
  for (let c = 0; c < columns; c++) {
    const sample = plots.find((p) => p.position?.col === c);
    const xOpts: any = (sample as any)?.options?.x || {};
    const xType = xOpts?.type;
    const xDomain = xOpts?.domain as any;
    let height = 24;
    if (xType === 'band' && Array.isArray(xDomain)) {
      const longestPx = xDomain.reduce((m: number, v: any) => Math.max(m, estimateTextPx(String(v))), 0);
      // Approx vertical component of rotated labels at 45deg
      const rotatedVertical = Math.ceil(longestPx * Math.SQRT1_2) + 8; // 0.707 + padding
      height = Math.max(30, 14 + rotatedVertical); // base tick + labels
    } else {
      // numeric or time, modest ticks
      height = 30;
    }
    if (height > maxHeight) maxHeight = height;
  }
  return maxHeight;
}

function computeDynamicYLabelColPx(spec: PlotResult, rowHeightPx: number): number {
  const rows = spec.layout?.rows || 1;
  const plots = spec.plots || [];
  let maxLabelWidth = 16; // Default width

  const FONT_SIZE_PX = 10;
  const LINE_HEIGHT = 1.2;
  const CHAR_HEIGHT_PX = FONT_SIZE_PX; // Approximate height of a character

  for (let r = 0; r < rows; r++) {
    const sample = plots.find((p) => p.position?.row === r);
    const yOpts: any = (sample as any)?.options?.y || {};
    const yLabel = yOpts?.label as string | undefined;

    if (yLabel && rowHeightPx > 0) {
      const charsPerColumn = Math.max(1, Math.floor(rowHeightPx / CHAR_HEIGHT_PX));
      const requiredColumns = Math.ceil(yLabel.length / charsPerColumn);
      const requiredWidth = requiredColumns * FONT_SIZE_PX * LINE_HEIGHT;
      if (requiredWidth > maxLabelWidth) {
        maxLabelWidth = requiredWidth;
      }
    }
  }
  return Math.ceil(maxLabelWidth);
}

/**
 * ChartGrid - Renders Observable Plot charts (single or multiple)
 * 
 * ===============================================================================
 * ARCHITECTURE: Three-Layer Scrolling System
 * ===============================================================================
 * 
 * This component uses THREE overlapping absolute-positioned layers to achieve
 * independent horizontal and vertical scrolling behavior for faceted chart grids.
 * 
 * WHY THREE LAYERS?
 * - We need horizontal scrolling for wide grids (many columns)
 * - We need vertical scrolling for tall grids (many rows)
 * - We need FIXED Y-axis labels on the left (don't scroll horizontally)
 * - We need FIXED X-axis labels at the bottom (don't scroll vertically)
 * - We need FIXED facet headers at top and left (don't scroll in their direction)
 * 
 * LAYER 1: HORIZONTAL SCROLL (z-index: 3, highest)
 * --------------------------------------------------
 * Position: Absolute, left offset by fixed Y-axis width, scrolls horizontally
 * Contains:
 *   - Top facet headers (column labels) - FIXED when scrolling vertically
 *   - Main plots area - Synced with vertical scroll via translateY transform
 *   - Bottom X-axes - FIXED when scrolling vertically
 * Grid Structure:
 *   gridTemplateColumns: single column (minmax(0, 1fr))
 *   gridTemplateRows: [topHeader | plots (1fr) | xAxes | spacer]
 * 
 * LAYER 2: VERTICAL SCROLL (z-index: 2, middle)
 * ----------------------------------------------
 * Position: Absolute, full width, scrolls vertically
 * Contains:
 *   - Left Y-axes and labels (fixed width) - FIXED when scrolling horizontally
 *   - Transparent sizing divs (for proper scrollbar calculation)
 * Grid Structure:
 *   gridTemplateColumns: [leftFixed | spacer (1fr)]
 *   gridTemplateRows: matches plot grid (one row per plot row)
 * Pointer Events: Mostly disabled to allow clicks through to Layer 1 plots
 * 
 * LAYER 3: PLOT GRID (inside Layer 1's plot area)
 * ------------------------------------------------
 * The actual CSS Grid containing the faceted charts
 * Grid Structure:
 *   gridTemplateColumns: plotTemplateColumns (e.g., "400px minmax(160px, 1fr) 300px")
 *   gridTemplateRows: plotRowsSpec (e.g., "200px 150px 200px")
 * Positioning: Each plot has explicit gridColumn and gridRow
 * Vertical Sync: Translated via transform: translateY(-scrollTop) to match Layer 2
 * 
 * COORDINATE SYSTEMS:
 * -------------------
 * 1. Grid Positions: 1-based (CSS Grid spec: gridColumn: 1, gridRow: 1)
 * 2. Array Indices: 0-based (JavaScript: plots[0], columnSizes[0])
 * 3. Scroll Offsets: Pixels from top-left origin (scrollTop, scrollLeft)
 * 4. Template Strings: Space-separated track sizes ("400px 1fr 300px")
 * 
 * SCROLLING MECHANICS:
 * --------------------
 * - User scrolls Layer 1 (horizontal) → plots move left/right
 * - User scrolls Layer 2 (vertical) → Y-axes move up/down
 * - Layer 1 plots are translateY-synced with Layer 2's scrollTop
 * - Wheel events are routed: deltaY → vertical, deltaX → horizontal
 * 
 * RESIZE FEATURE (future):
 * ------------------------
 * - Resize handles will be positioned on grid lines (between columns/rows)
 * - Handles will be in the axis areas (where cursor changes)
 * - Dragging updates columnSizes/rowSizes state arrays
 * - Template strings are regenerated from state on each resize
 * - All three layers must stay synchronized during resize
 * 
 * ===============================================================================
 */
const ChartGrid: React.FC<ChartGridProps> = ({ spec, data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const vScrollRef = useRef<HTMLDivElement>(null);
  const plotsTranslateRef = useRef<HTMLDivElement>(null);
  const plotGridRef = useRef<HTMLDivElement>(null); // Reference to the actual plot grid for measuring positions
  const [rowHeightPx, setRowHeightPx] = useState<number>(MIN_GRID_ROW_PX);
  const rowsForSizing = (typeof (spec as any)?.layout?.rows === 'number' ? (spec as any).layout.rows : 1) as number;

  // Container dimensions for resize overlay positioning
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });

  // Track scroll offsets so the resize handles can stay aligned with the
  // scrolled grid content in both directions.
  const [scrollOffsets, setScrollOffsets] = useState<{ horizontal: number; vertical: number }>({
    horizontal: 0,
    vertical: 0,
  });

  // User-controlled cell sizing (uniform across all cells)
  // null = use automatic sizing, number = user has manually resized
  const [userCellWidth, setUserCellWidth] = useState<number | null>(null);
  const [userCellHeight, setUserCellHeight] = useState<number | null>(null);

  // Reset user overrides when spec changes (new data/chart type)
  useEffect(() => {
    setUserCellWidth(null);
    setUserCellHeight(null);
  }, [spec?.layout?.columns, spec?.layout?.rows]);

  // Handler to reset cell sizes to automatic
  const handleResetCellSizes = () => {
    setUserCellWidth(null);
    setUserCellHeight(null);
  };

  // Check if user has made any size overrides
  const hasUserSizeOverrides = userCellWidth !== null || userCellHeight !== null;

  // Resize handlers (called by GridResizeOverlay)
  const handleColumnResize = useCallback((newWidth: number) => {
    const constrainedWidth = Math.max(50, Math.min(5000, Math.round(newWidth)));
    setUserCellWidth(constrainedWidth);
  }, []);

  const handleRowResize = useCallback((newHeight: number) => {
    const constrainedHeight = Math.max(50, Math.min(5000, Math.round(newHeight)));
    setUserCellHeight(constrainedHeight);
  }, []);

  // Route vertical wheel deltas to the vertical scroller so vertical scroll
  // works even when the pointer is over the horizontal layer (charts/headers).
  // Wheel handling is set on the outer container with capture. We route vertical deltas
  // to the vertical scroller always; horizontal deltas only when not hovering the left Y area.
  // The handler is defined later where leftFixedWidthPx is known.

  // Keep the plots grid in the horizontal layer visually in sync with the
  // vertical scroller by translating it opposite to the vertical scroll offset.
  // NOTE: We need to re-attach when the DOM structure changes (multi-plot scenarios)
  // but we avoid depending on the full spec object to prevent unnecessary re-runs
  const plotsCount = spec?.plots?.length ?? 0;
  const hasMultiPlot = plotsCount > 1;
  
  useEffect(() => {
    const scroller = vScrollRef.current;
    const target = plotsTranslateRef.current;
    if (!scroller || !target) return;
    const onScroll = () => {
      const y = scroller.scrollTop;
      (target as HTMLDivElement).style.transform = `translateY(${-y}px)`;
      // Keep vertical scroll offset in state for the resize overlay.
      setScrollOffsets((prev) =>
        prev.vertical === y ? prev : { ...prev, vertical: y }
      );
    };
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => scroller.removeEventListener('scroll', onScroll as any);
  }, [hasMultiPlot]); // Re-attach when plot structure changes, not on every spec change

  // Track horizontal scroll so column resize handles track the visible gridlines.
  // NOTE: Re-attach when plot structure changes to handle DOM recreation
  useEffect(() => {
    const scroller = hScrollRef.current;
    if (!scroller) return;

    const onScroll = () => {
      const x = scroller.scrollLeft;
      setScrollOffsets((prev) =>
        prev.horizontal === x ? prev : { ...prev, horizontal: x }
      );
    };

    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => scroller.removeEventListener('scroll', onScroll as any);
  }, [hasMultiPlot]); // Re-attach when plot structure changes, not on every spec change

  // Dynamically size row height globally (not conditionally in the grid branch)
  // Ensure the scroller is mounted and measured before computing, and keep it updated
  // NOTE: Only depends on rowsForSizing, not full spec, to avoid unnecessary reinitializations
  useEffect(() => {
    let rafId = 0;
    let updateRafId: number | null = null;
    let isUpdateScheduled = false;
    let ro: ResizeObserver | null = null;

    const updateRowHeight = () => {
      const scroller = vScrollRef.current;
      if (!scroller) return;
      const available = scroller.clientHeight;
      const r = Math.max(1, rowsForSizing);
      if (available > 0) {
        const h = Math.max(MIN_GRID_ROW_PX, Math.floor(available / r));
        setRowHeightPx(h);
      }
      isUpdateScheduled = false;
    };

    // Throttle updates using requestAnimationFrame
    const scheduleUpdate = () => {
      if (!isUpdateScheduled) {
        isUpdateScheduled = true;
        updateRafId = requestAnimationFrame(updateRowHeight);
      }
    };

    const attachWhenReady = () => {
      if (!vScrollRef.current) {
        rafId = window.requestAnimationFrame(attachWhenReady);
        return;
      }
      // Initial compute once the element exists
      updateRowHeight();
      // Observe size changes of the scroller with RAF throttling
      ro = new ResizeObserver(scheduleUpdate);
      ro.observe(vScrollRef.current as Element);
      // Also respond to window resizes with throttling
      window.addEventListener('resize', scheduleUpdate);
    };

    attachWhenReady();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (updateRafId !== null) window.cancelAnimationFrame(updateRafId);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [rowsForSizing]); // Only rowsForSizing, not spec - avoids teardown on every spec change

  // Track container dimensions for resize overlay
  // NOTE: No spec dependency needed - container size tracking is independent of spec changes
  useEffect(() => {
    if (!containerRef.current) return;

    let rafId: number | null = null;
    let isUpdateScheduled = false;

    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
      isUpdateScheduled = false;
    };

    // Throttle updates using requestAnimationFrame
    const scheduleUpdate = () => {
      if (!isUpdateScheduled) {
        isUpdateScheduled = true;
        rafId = requestAnimationFrame(updateDimensions);
      }
    };

    // Initial measurement
    updateDimensions();

    // Observe size changes with RAF throttling
    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []); // Empty deps - container size tracking is independent of spec
  
  // Handle null or missing spec
  if (!spec) {
    return (
      <div className={styles.container} ref={containerRef}>
        <p>No chart data available.</p>
      </div>
    );
  }

  // Handle multi-plot scenarios (grid / horizontal / vertical)
  if (spec.plots && spec.plots.length > 0) {
    const layoutType = spec.layout?.type || 'grid';
    const columns = spec.layout?.columns || 1;
    const rows = spec.layout?.rows || 1;

    // Build template tracks
    const columnSizes = spec.layout?.columnSizes;
    const rowSizes = spec.layout?.rowSizes;

    const minColumnPx = MIN_GRID_COLUMN_PX; // minimum width; columns expand when there is space
    
    // Column template: use user override if set, otherwise use spec or automatic sizing
    const plotTemplateColumns = userCellWidth !== null
      ? `repeat(${columns}, ${userCellWidth}px)` // Uniform user-controlled sizing
      : layoutType === 'vertical'
        ? `minmax(${minColumnPx}px, 1fr)`
        : columnSizes && columnSizes.length > 0
          ? columnSizes
              .slice(0, columns)
              .map((c) => (typeof c === 'number' ? `${c}px` : `minmax(${minColumnPx}px, 1fr)`))
              .join(' ')
          : `repeat(${columns}, minmax(${minColumnPx}px, 1fr))`;

    // Compute total content width from columnSizes (fallback to min width)
    const totalContentWidthPx = (() => {
      // User override takes precedence
      if (userCellWidth !== null) return columns * userCellWidth;
      
      if (!columnSizes || columnSizes.length === 0) return columns * minColumnPx;
      let sum = 0;
      for (let i = 0; i < Math.min(columns, columnSizes.length); i++) {
        const c = columnSizes[i];
        sum += typeof c === 'number' ? c : minColumnPx;
      }
      return sum;
    })();

    // Rows spec to apply consistently across all stacked layers (plots, left labels, transparent sizing)
    // User override takes precedence, then use explicit rowSizes, otherwise infer from samples or use automatic rowHeightPx
    const inferredRowSizes: Array<number | 'fr'> = (() => {
      // If user has set a height override, use that for all rows
      if (userCellHeight !== null) {
        return Array(rows).fill(userCellHeight);
      }
      
      // Otherwise use the existing logic
      const sizes: Array<number | 'fr'> = [];
      for (let r = 0; r < rows; r++) {
        const sample = (spec.plots || []).find((p) => p.position?.row === r);
        const h = (sample as any)?.options?.height;
        sizes.push(typeof h === 'number' ? h : rowSizes && typeof rowSizes[r] === 'number' ? (rowSizes[r] as number) : rowHeightPx);
      }
      return sizes;
    })();

    const plotRowsSpec = inferredRowSizes.map((h) => (typeof h === 'number' ? `${h}px` : `${rowHeightPx}px`)).join(' ');
    const actualRowHeights: number[] = inferredRowSizes.map((h) => (typeof h === 'number' ? h : rowHeightPx));

    // Helpers for hierarchical label rendering
    const colLevels = spec.facetLabels?.colsLevels || [];
    const rowLevels = spec.facetLabels?.rowsLevels || [];
    const hasRowFacets = rowLevels.length > 0;

    const baseCols = spec.facetLabels?.spans?.baseCols || 1;
    const baseRows = spec.facetLabels?.spans?.baseRows || 1;

    const yLevelsCount = rowLevels.length;
    const leftLabelsPx = hasRowFacets ? NAMES_BAND_LEFT_PX + VALUES_BAND_LEFT_PX * yLevelsCount : 0;

    // Dynamic gutters
    const dynamicYAxisPx = computeDynamicYAxisGutterPx(spec, rows);
    const dynamicXAxisPx = computeDynamicXAxisGutterPx(spec, columns);
    const yLabelColPx = computeDynamicYLabelColPx(spec, rowHeightPx);
    const leftFixedWidthPx = leftLabelsPx + yLabelColPx + dynamicYAxisPx;

    // Calculate header height for proper alignment
    const topHeaderHeight = colLevels.length > 0 ? 
      20 + (colLevels.length * VALUES_BAND_TOP_PX) : 0; // Names band + value bands

    // Wheel routing: capture phase on container to detect pointer position
    const onWheelCapture: React.WheelEventHandler<HTMLDivElement> = (e) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const x = e.clientX;
      const inLeftFixed = !!rect && x <= rect.left + leftFixedWidthPx + 1; // left area width
      // Always drive vertical scroll with deltaY
      if (vScrollRef.current && e.deltaY !== 0) {
        vScrollRef.current.scrollBy({ top: e.deltaY });
      }
      // Drive horizontal scroll only when not over the left fixed area
      if (!inLeftFixed && hScrollRef.current && e.deltaX !== 0) {
        hScrollRef.current.scrollBy({ left: e.deltaX });
      }
      if (e.deltaX !== 0 || e.deltaY !== 0) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    return (
      <div className={styles.container} ref={containerRef} style={{ position: 'relative', height: '100%', overflow: 'hidden' }} onWheelCapture={onWheelCapture}>
        {/* ===============================================================
            LAYER 1: HORIZONTAL SCROLL (z-index: 3)
            Contains: top headers, plots (with vertical sync), bottom axes
            =============================================================== */}
        <div ref={hScrollRef} className={styles.horizontalScrollLayer} style={{
          position: 'absolute',
          top: 0,
          left: leftFixedWidthPx,
          right: 14, // Leave space for vertical scrollbar (14px wide)
          bottom: 0, // Leave space for horizontal scrollbar
          overflowX: 'scroll',
          overflowY: 'hidden',
          // Put the horizontal (plots) layer above the vertical labels/scroll layer so
          // pointer events reach the SVG plots rather than an overlapping transparent div.
          zIndex: 3,
          pointerEvents: 'auto'
        }}>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: `minmax(0, 1fr)`,
            gridTemplateRows: spec.facetLabels ? `${topHeaderHeight}px 1fr ${dynamicXAxisPx}px 0px` : `1fr ${dynamicXAxisPx}px 0px`,
            minWidth: `${totalContentWidthPx}px`,
            width: '100%',
            height: '100%'
          }}>
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
        <div ref={vScrollRef} className={styles.verticalScrollLayer} style={{
          position: 'absolute',
          top: spec.facetLabels ? topHeaderHeight : 0,
          left: 0,
          right: 0,
          bottom: dynamicXAxisPx + X_LABEL_ROW_PX + 16,
          overflowY: 'scroll',
          overflowX: 'hidden',
          zIndex: 2,
          // Allow pointer events on the scrollbar area (right edge)
          // Content below will still receive hover events through the transparent grid
          pointerEvents: 'auto'
        }}>
          <div className="vertical-scroll-content" style={{
            display: 'grid',
            gridTemplateColumns: `${leftFixedWidthPx}px 1fr`,
            gridTemplateRows: plotRowsSpec,
            // Disable pointer events on content so plots below receive hover
            pointerEvents: 'none'
          }}>
            
            {/* Left Y labels/scales area */}
            <div style={{ gridColumn: 1, gridRow: '1 / -1', pointerEvents: 'auto', borderRight: `1px solid ${GRID_DIVIDER_COLOR}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: hasRowFacets ? `${leftLabelsPx}px ${yLabelColPx}px ${dynamicYAxisPx}px` : `${yLabelColPx}px ${dynamicYAxisPx}px`, gridTemplateRows: plotRowsSpec }}>
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
                      <div style={{ 
                        writingMode: useVertical ? 'vertical-rl' : 'horizontal-tb', 
                        transform: useVertical ? 'rotate(180deg)' : 'none', 
                        textAlign: 'center', 
                        fontSize: '10px', 
                        fontWeight: 'bold',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        lineHeight: '1.2',
                      }}>
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

            {/* Plots area (transparent, just for scrolling).
                Important: disable pointer events so this overlay does not block hover events to the SVG plots below. */}
            <div style={{ gridColumn: 2, gridRow: 1, pointerEvents: 'none' }}>
              <div ref={plotGridRef} style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, gridTemplateRows: plotRowsSpec, minWidth: `${totalContentWidthPx}px`, opacity: 0, pointerEvents: 'none' }}>
                {(spec.plots || []).map((plot, index) => {
                  const key = plot.id || String(index);
                  const pos = plot.position;
                  const gridItemStyle: React.CSSProperties | undefined = pos
                    ? { gridColumn: (pos.col + 1), gridRow: pos.row + 1 }
                    : undefined;
                  return (
                    <div key={`vertical-${key}`} style={{ ...gridItemStyle, minHeight: `${MIN_GRID_ROW_PX}px` }} />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Grid Resize Overlay - handles positioned on gridlines in axis areas */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none', // Only handles are interactive
          zIndex: 100, // Above everything else
        }}>
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
            onColumnResize={handleColumnResize}
            onRowResize={handleRowResize}
          />
        </div>

        {/* Reset button for cell size overrides */}
        {hasUserSizeOverrides && (
          <button
            onClick={handleResetCellSizes}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 300, // Above everything
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