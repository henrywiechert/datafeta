import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';

import { QueryResult } from '../../types';
import { PlotResult } from '../../observable-plot-generator/types';
import ObservablePlot from './ObservablePlot';
import styles from './ChartGrid.module.css';
import { MIN_GRID_COLUMN_PX, MIN_GRID_ROW_PX } from '../../config/chartLayoutConfig';

interface ChartGridProps {
  spec: PlotResult | null;
  data: QueryResult | null;
}

/**
 * Remove axis labels (preserve grid). For external axes we also disable the axis lines.
 */
function suppressAxes(options: any, hideX: boolean, hideY: boolean) {
  const next = { ...options };
  // Remove all margins so plot fills the cell exactly
  next.marginLeft = 0;
  next.marginRight = 0;
  next.marginTop = 0;
  next.marginBottom = 0;
  next.inset = 0;
  if (hideX) {
    next.x = {
      ...(next.x || {}),
      label: '',
      axis: null,
      grid: true,
    };
  }
  if (hideY) {
    next.y = {
      ...(next.y || {}),
      label: '',
      axis: null,
      grid: true,
    };
  }
  return next;
}

/**
 * Build axis-only plot options for external gutters.
 */
function buildYAxisOptions(domain: any, gutterPx: number, type?: string) {
  const isCategorical = type === 'band' || (Array.isArray(domain) && domain.length > 0 && typeof domain[0] !== 'number');
  return {
    frame: null,
    marginLeft: Math.max(12, gutterPx - 2),
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
    inset: 0,
    x: { axis: null },
    y: { label: '', domain: domain ?? [0, 1], ...(isCategorical ? { type: 'band' as any } : {}), labelArrow: null },
    marks: [Plot.axisY()],
  } as any;
}

function buildXAxisOptions(label: string | undefined, domain: any, gutterPx: number, type?: string) {
  const isCategorical = type === 'band' || (Array.isArray(domain) && domain.length > 0 && typeof domain[0] !== 'number');
  return {
    frame: null,
    height: Math.max(16, gutterPx),
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    marginBottom: Math.max(12, gutterPx - 2),
    inset: 0,
    y: { axis: null },
    x: { label: '', domain: domain ?? [0, 1], ...(isCategorical ? { type: 'band' as any } : {}), labelArrow: null }, // label rendered in separate row below
    marks: [Plot.axisX()],
  } as any;
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
      height = Math.max(28, 14 + rotatedVertical); // base tick + labels
    } else {
      // numeric or time, modest ticks
      height = 28;
    }
    if (height > maxHeight) maxHeight = height;
  }
  return maxHeight;
}

/**
 * ChartGrid - Renders Observable Plot charts (single or multiple)
 */
const ChartGrid: React.FC<ChartGridProps> = ({ spec, data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const vScrollRef = useRef<HTMLDivElement>(null);
  const plotsTranslateRef = useRef<HTMLDivElement>(null);
  const [rowHeightPx, setRowHeightPx] = useState<number>(MIN_GRID_ROW_PX);
  const rowsForSizing = (typeof (spec as any)?.layout?.rows === 'number' ? (spec as any).layout.rows : 1) as number;

  // Route vertical wheel deltas to the vertical scroller so vertical scroll
  // works even when the pointer is over the horizontal layer (charts/headers).
  // Wheel handling is set on the outer container with capture. We route vertical deltas
  // to the vertical scroller always; horizontal deltas only when not hovering the left Y area.
  // The handler is defined later where leftFixedWidthPx is known.

  // Keep the plots grid in the horizontal layer visually in sync with the
  // vertical scroller by translating it opposite to the vertical scroll offset.
  useEffect(() => {
    const scroller = vScrollRef.current;
    const target = plotsTranslateRef.current;
    if (!scroller || !target) return;
    const onScroll = () => {
      const y = scroller.scrollTop;
      (target as HTMLDivElement).style.transform = `translateY(${-y}px)`;
    };
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => scroller.removeEventListener('scroll', onScroll as any);
  }, [spec]);

  // Dynamically size row height globally (not conditionally in the grid branch)
  // Ensure the scroller is mounted and measured before computing, and keep it updated
  useEffect(() => {
    let rafId = 0;
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
    };

    const attachWhenReady = () => {
      if (!vScrollRef.current) {
        rafId = window.requestAnimationFrame(attachWhenReady);
        return;
      }
      // Initial compute once the element exists
      updateRowHeight();
      // Observe size changes of the scroller
      ro = new ResizeObserver(() => updateRowHeight());
      ro.observe(vScrollRef.current as Element);
      // Also respond to window resizes
      window.addEventListener('resize', updateRowHeight);
    };

    attachWhenReady();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateRowHeight);
    };
  }, [rowsForSizing, spec]);
  
  // Handle null or missing spec
  if (!spec) {
    return (
      <div className={styles.container} ref={containerRef}>
        <p>Generating chart specification...</p>
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
    const plotTemplateColumns =
      layoutType === 'vertical'
        ? `minmax(${minColumnPx}px, 1fr)`
        : columnSizes && columnSizes.length > 0
          ? columnSizes
              .slice(0, columns)
              .map((c) => (typeof c === 'number' ? `${c}px` : `minmax(${minColumnPx}px, 1fr)`))
              .join(' ')
          : `repeat(${columns}, minmax(${minColumnPx}px, 1fr))`;

    // Compute total content width from columnSizes (fallback to min width)
    const totalContentWidthPx = (() => {
      if (!columnSizes || columnSizes.length === 0) return columns * minColumnPx;
      let sum = 0;
      for (let i = 0; i < Math.min(columns, columnSizes.length); i++) {
        const c = columnSizes[i];
        sum += typeof c === 'number' ? c : minColumnPx;
      }
      return sum;
    })();

    const plotTemplateRows =
      layoutType === 'horizontal'
        ? `minmax(${MIN_GRID_ROW_PX}px, 1fr)`
        : rowSizes && rowSizes.length > 0
          ? rowSizes
              .slice(0, rows)
              .map((r) => (typeof r === 'number' ? `${r}px` : `minmax(${MIN_GRID_ROW_PX}px, 1fr)`))
              .join(' ')
          : `repeat(${rows}, minmax(${MIN_GRID_ROW_PX}px, 1fr))`;

    // Rows spec to apply consistently across all stacked layers (plots, left labels, transparent sizing)
    const plotRowsSpec =
      rowSizes && rowSizes.length > 0 && rowSizes.some((r) => typeof r === 'number')
        ? rowSizes
            .slice(0, rows)
            .map((r) => (typeof r === 'number' ? `${r}px` : `${MIN_GRID_ROW_PX}px`))
            .join(' ')
        : `repeat(${rows}, ${rowHeightPx}px)`;

    // Fixed pixel-size rows to keep labels/axes aligned with the charts
    const fixedPlotTemplateRows = `repeat(${rows}, ${MIN_GRID_ROW_PX}px)`;

    // Helpers for hierarchical label rendering
    const colLevels = spec.facetLabels?.colsLevels || [];
    const rowLevels = spec.facetLabels?.rowsLevels || [];

    const baseCols = spec.facetLabels?.spans?.baseCols || 1;
    const baseRows = spec.facetLabels?.spans?.baseRows || 1;

    // Sizing constants for label bands and axis gutters
    const NAMES_BAND_LEFT_PX = 20;
    const VALUES_BAND_LEFT_PX = 20;
    const VALUES_BAND_TOP_PX = 20;
    const Y_LABEL_COL_PX = 16;
    const X_LABEL_ROW_PX = 16;

    const yLevelsCount = rowLevels.length;
    const leftLabelsPx = NAMES_BAND_LEFT_PX + VALUES_BAND_LEFT_PX * yLevelsCount;

    // Dynamic gutters
    const dynamicYAxisPx = computeDynamicYAxisGutterPx(spec, rows);
    const dynamicXAxisPx = computeDynamicXAxisGutterPx(spec, columns);
    const leftFixedWidthPx = leftLabelsPx + Y_LABEL_COL_PX + dynamicYAxisPx;

    // Calculate header height for proper alignment
    const topHeaderHeight = colLevels.length > 0 ? 
      20 + (colLevels.length * VALUES_BAND_TOP_PX) : 0; // Names band + value bands

    const dividerColor = '#99a795';

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
        {/* Horizontal scroll layer (plots + top/bottom elements). Starts at leftFixedWidthPx to avoid overlapping the fixed Y band */}
        <div ref={hScrollRef} style={{
          position: 'absolute',
          top: 0,
          left: leftFixedWidthPx,
          right: 0,
          bottom: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          zIndex: 1,
          pointerEvents: 'auto'
        }}>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: `minmax(0, 1fr)`,
            gridTemplateRows: spec.facetLabels ? `${topHeaderHeight}px 1fr ${dynamicXAxisPx}px ${X_LABEL_ROW_PX}px` : `1fr ${dynamicXAxisPx}px ${X_LABEL_ROW_PX}px`,
            minWidth: `${columns * minColumnPx}px`,
            width: '100%',
            height: '100%'
          }}>
            {/* Top facet headers (if present) */}
            {spec.facetLabels && (
              <div style={{ gridColumn: 1, gridRow: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns }}>
                  {colLevels.length > 0 ? (
                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
                      <div style={{ position: 'sticky', left: 0, right: 0, margin: '0 auto', width: 'max-content', fontSize: '12px', fontWeight: 600, background: 'white', padding: '2px 6px', zIndex: 2 }}>
                        {colLevels.map(l => l.fieldLabel).join(' / ')}
                      </div>
                    </div>
                  ) : null}
                  {colLevels.map((level, levelIdx) => {
                    const counts = colLevels.map(l => l.values.length);
                    const innerProduct = counts.slice(levelIdx + 1).reduce((a, b) => a * b, 1) || 1;
                    const outerProduct = counts.slice(0, levelIdx).reduce((a, b) => a * b, 1) || 1;
                    const span = baseCols * innerProduct;
                    const groupSpan = span * level.values.length;
                    const cells: React.ReactNode[] = [];
                    for (let r = 0; r < outerProduct; r++) {
                      const groupStart = r * groupSpan;
                      level.values.forEach((val: any, i: number) => {
                        const startCol = 1 + groupStart + i * span;
                        cells.push(
                          <div
                            key={`col-level-${levelIdx}-seg-${r}-val-${i}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: `${VALUES_BAND_TOP_PX}px`,
                              gridColumn: `${startCol} / span ${span}`,
                              background: 'transparent',
                              borderBottom: `1px solid ${dividerColor}`,
                              borderRight: `1px solid ${dividerColor}`,
                              fontSize: '10px',
                              padding: 0,
                              overflow: 'hidden',
                            }}
                          >
                            {String(val)}
                          </div>
                        );
                      });
                    }
                    return <React.Fragment key={`col-level-row-${levelIdx}`}>{cells}</React.Fragment>;
                  })}
                </div>
              </div>
            )}

            {/* Main plots area (clipped so translated plots don't overlap headers/footers) */}
            <div style={{ gridColumn: 1, gridRow: spec.facetLabels ? 2 : 1, overflow: 'hidden', position: 'relative' }}>
              <div ref={plotsTranslateRef} style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, gridTemplateRows: plotRowsSpec, minWidth: `${totalContentWidthPx}px`, willChange: 'transform' }}>
                {(spec.plots || []).map((plot, index) => {
                  const key = plot.id || String(index);
                  const pos = plot.position;
                  const gridItemStyle: React.CSSProperties | undefined = pos
                    ? { gridColumn: (pos.col + 1), gridRow: pos.row + 1, borderRight: '1px solid #99a795', borderBottom: '1px solid #99a795' }
                    : undefined;
                  const opts = suppressAxes(plot.options, true, true);
                  return (
                    <div key={key} className={styles.plotWrapper} style={gridItemStyle}>
                      <div className={styles.observablePlotContainer}>
                        <ObservablePlot options={opts} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom X scales */}
            <div style={{ gridColumn: 1, gridRow: spec.facetLabels ? 3 : 2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, minWidth: `${totalContentWidthPx}px` }}>
                {Array.from({ length: columns }).map((_, c) => {
                  const sample = (spec.plots || []).find((p) => p.position?.col === c);
                  const xLabel = (sample as any)?.options?.x?.label;
                  const xDomain = (sample as any)?.options?.x?.domain;
                  const xType = (sample as any)?.options?.x?.type;
                  const xRotate = xType === 'band' ? -45 : 0;
                  return (
                    <div key={`x-axis-${c}`} style={{ gridColumn: c + 1, borderRight: c < columns - 1 ? '1px solid #99a795' : undefined, borderTop: `1px solid ${dividerColor}` }}>
                      <ObservablePlot options={{ ...buildXAxisOptions(xLabel, xDomain, dynamicXAxisPx, xType), marks: [Plot.axisX({ tickRotate: xRotate as any })] as any }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom X labels */}
            <div style={{ gridColumn: 1, gridRow: spec.facetLabels ? 4 : 3 }}>
              <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, minWidth: `${totalContentWidthPx}px` }}>
                {Array.from({ length: columns }).map((_, c) => {
                  const sample = (spec.plots || []).find((p) => p.position?.col === c);
                  const xLabel = (sample as any)?.options?.x?.label as string | undefined;
                  return (
                    <div key={`x-label-${c}`} style={{ 
                      gridColumn: c + 1, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '10px', 
                      fontWeight: 'bold',
                      padding: '2px',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        maxWidth: '100%',
                        lineHeight: '1.2'
                      }}>
                        {xLabel || ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Vertical scroll layer (left Y elements + plots), clipped between top headers and bottom axes */}
        <div ref={vScrollRef} style={{
          position: 'absolute',
          top: spec.facetLabels ? topHeaderHeight : 0,
          left: 0,
          right: 0,
          bottom: dynamicXAxisPx + X_LABEL_ROW_PX,
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 2,
          pointerEvents: 'auto'
        }}>
          {/* Make scrollbar interactive */}
          <style>{`
            .vertical-scroll-content::-webkit-scrollbar {
              pointer-events: auto;
            }
          `}</style>
          <div className="vertical-scroll-content" style={{
            display: 'grid',
            gridTemplateColumns: `${leftFixedWidthPx}px 1fr`,
            gridTemplateRows: plotRowsSpec,
            pointerEvents: 'none'
          }}>
            
            {/* Left Y labels/scales area */}
            <div style={{ gridColumn: 1, gridRow: '1 / -1', pointerEvents: 'auto', borderRight: `1px solid ${dividerColor}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: `${leftLabelsPx}px ${Y_LABEL_COL_PX}px ${dynamicYAxisPx}px`, gridTemplateRows: plotRowsSpec }}>
                {/* Left facet labels area */}
                {spec.facetLabels && (
                  <div
                    style={{
                      gridColumn: 1,
                      gridRow: '1 / span ' + rows,
                      display: 'grid',
                      gridTemplateColumns: `${NAMES_BAND_LEFT_PX}px ${new Array(yLevelsCount).fill(`${VALUES_BAND_LEFT_PX}px`).join(' ')}`,
                      gridTemplateRows: `repeat(${rows}, ${rowHeightPx}px)`,
                      alignItems: 'stretch',
                    }}
                  >
                    {/* Keep in grid, but center using sticky at 50% with translate */}
                    <div style={{ gridColumn: 1, gridRow: '1 / -1', position: 'sticky', top: 0, bottom: 0, margin: 'auto 0', height: 'fit-content', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                      <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '12px', fontWeight: 600, background: 'white', padding: '4px 2px', margin: 'auto' }}>
                        {rowLevels.map(l => l.fieldLabel).join(' / ')}
                      </div>
                    </div>
                    {rowLevels.length > 0 && (
                      <div
                        style={{
                          gridColumn: 1,
                          gridRow: '1 / -1',
                          writingMode: 'vertical-rl',
                          transform: 'rotate(180deg)',
                          padding: '2px 0',
                          fontSize: '10px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid #99a795',
                          borderRadius: 4,
                          opacity: 0,
                        }}
                      >
                        {rowLevels.map(l => l.fieldLabel).join(' / ')}
                      </div>
                    )}
                    {/* One green column per Y-level, with properly spanned cells */}
                    {rowLevels.map((level, levelIdx) => {
                      const counts = rowLevels.map(l => l.values.length);
                      const innerProduct = counts.slice(levelIdx + 1).reduce((a, b) => a * b, 1) || 1;
                      const outerProduct = counts.slice(0, levelIdx).reduce((a, b) => a * b, 1) || 1;
                      const span = baseRows * innerProduct;
                      const groupSpan = span * level.values.length;
                      const cells: React.ReactNode[] = [];
                      for (let r = 0; r < outerProduct; r++) {
                        const groupStart = r * groupSpan; // 0-based
                        level.values.forEach((val: any, i: number) => {
                          const startRow = groupStart + i * span + 1; // 1-based grid row start
                          cells.push(
                            <div
                              key={`yval-level-${levelIdx}-rep-${r}-val-${i}`}
                              style={{
                                gridColumn: levelIdx + 2,
                                gridRow: `${startRow} / span ${span}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRight: levelIdx === rowLevels.length - 1 ? '1px solid #99a795' : undefined,
                                borderLeft: levelIdx > 0 ? '1px solid #99a795' : undefined,
                                borderBottom: '1px solid #99a795',
                                background: 'transparent',
                                padding: 0,
                                overflow: 'hidden',
                              }}
                            >
                              <div style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', whiteSpace: 'nowrap', padding: '2px 0', fontSize: '10px' }}>{String(val)}</div>
                            </div>
                          );
                        });
                      }
                      return <React.Fragment key={`yval-level-${levelIdx}`}>{cells}</React.Fragment>;
                    })}
                  </div>
                )}

                {/* Y-axis vertical labels column */}
                {Array.from({ length: rows }).map((_, r) => {
                  const sample = (spec.plots || []).find((p) => p.position?.row === r);
                  const yOpts: any = (sample as any)?.options?.y || {};
                  const yLabel = yOpts?.label as string | undefined;
                  const yType = yOpts?.type;
                  const useVertical = yType !== 'band';
                  return (
                    <div
                      key={`y-label-${r}`}
                      style={{
                        gridColumn: spec.facetLabels ? 2 : 1,
                        gridRow: r + 1,
                        display: 'grid',
                        gridTemplateRows: `${rowHeightPx}px`,
                        alignItems: 'center',
                        justifyItems: 'center',
                        padding: 0,
                        margin: 0,
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
                        height: `${rowHeightPx}px`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {yLabel || ''}
                      </div>
                    </div>
                  );
                })}

                {/* Left external y-axes gutter */}
                {Array.from({ length: rows }).map((_, r) => {
                  const sample = (spec.plots || []).find((p) => p.position?.row === r);
                  const yDomain = (sample as any)?.options?.y?.domain;
                  const yType = (sample as any)?.options?.y?.type;
                  return (
                    <div key={`y-axis-${r}`} style={{ 
                      gridColumn: spec.facetLabels ? 3 : 2, 
                      gridRow: r + 1,
                      borderBottom: r < rows - 1 ? '1px solid #99a795' : undefined
                    }}>
                      <ObservablePlot options={buildYAxisOptions(yDomain, dynamicYAxisPx, yType)} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Plots area (transparent, just for scrolling) */}
            <div style={{ gridColumn: 2, gridRow: 1, pointerEvents: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, gridTemplateRows: plotRowsSpec, minWidth: `${totalContentWidthPx}px`, opacity: 0 }}>
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
      </div>
    );
  }

  // Handle single plot (legacy format)
  if (spec.options) {
    return (
      <div className={`${styles.container} ${styles.observablePlotContainer}`} ref={containerRef}>
        <ObservablePlot options={spec.options} />
      </div>
    );
  }

  // Fallback
  return (
    <div className={styles.container} ref={containerRef}>
      <p>No chart data available</p>
    </div>
  );
};

export default ChartGrid;