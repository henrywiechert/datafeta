import React, { useRef } from 'react';

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
function buildYAxisOptions(domain: any, gutterPx: number) {
  return {
    frame: null,
    marginLeft: Math.max(12, gutterPx - 2),
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
    inset: 0,
    x: { axis: null },
    y: { label: '', domain },
    marks: [],
  } as any;
}

function buildXAxisOptions(label: string | undefined, domain: any, gutterPx: number) {
  return {
    frame: null,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    marginBottom: Math.max(12, gutterPx - 2),
    inset: 0,
    y: { axis: null },
    x: { label: '', domain }, // label rendered in separate row below
    marks: [],
  } as any;
}

const TEXT_PX_PER_CHAR = 6; // conservative estimate for 12-14px font
const MIN_Y_AXIS_GUTTER_PX = 28;
const MAX_Y_AXIS_GUTTER_PX = 56;

function estimateTextPx(text?: string): number {
  if (!text) return 0;
  return Math.ceil(text.length * TEXT_PX_PER_CHAR);
}

function computeDynamicYAxisGutterPx(spec: PlotResult, rows: number): number {
  let maxWidth = MIN_Y_AXIS_GUTTER_PX;
  const plots = spec.plots || [];
  for (let r = 0; r < rows; r++) {
    const sample = plots.find((p) => p.position?.row === r);
    const yDomain = (sample as any)?.options?.y?.domain as [number, number] | undefined;
    let tickWidth = 0;
    if (Array.isArray(yDomain) && yDomain.length === 2) {
      const [a, b] = yDomain;
      tickWidth = Math.max(estimateTextPx(String(a)), estimateTextPx(String(b))) + 6; // small padding
    }
    const rowWidth = Math.max(MIN_Y_AXIS_GUTTER_PX, Math.min(MAX_Y_AXIS_GUTTER_PX, tickWidth));
    if (rowWidth > maxWidth) maxWidth = rowWidth;
  }
  return maxWidth;
}

function computeDynamicXAxisGutterPx(spec: PlotResult, columns: number): number {
  let maxHeight = 24; // minimum baseline
  const plots = spec.plots || [];
  for (let c = 0; c < columns; c++) {
    // Only ticks height; axis label is rendered in a separate row
    const tickHeight = 14 + 6; // font + padding
    const total = Math.max(24, tickHeight + 4);
    if (total > maxHeight) maxHeight = total;
  }
  return maxHeight;
}

/**
 * ChartGrid - Renders Observable Plot charts (single or multiple)
 */
const ChartGrid: React.FC<ChartGridProps> = ({ spec, data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
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

    const plotTemplateColumns =
      layoutType === 'vertical'
        ? '1fr'
        : columnSizes && columnSizes.length > 0
          ? columnSizes
              .slice(0, columns)
              .map((c) => (typeof c === 'number' ? `${c}px` : `minmax(${MIN_GRID_COLUMN_PX}px, 1fr)`))
              .join(' ')
          : `repeat(${columns}, 1fr)`;

    const plotTemplateRows =
      layoutType === 'horizontal'
        ? '1fr'
        : rowSizes && rowSizes.length > 0
          ? rowSizes
              .slice(0, rows)
              .map((r) => (typeof r === 'number' ? `${r}px` : `minmax(${MIN_GRID_ROW_PX}px, 1fr)`))
              .join(' ')
          : `repeat(${rows}, 1fr)`;

    // Helpers for hierarchical label rendering
    const colLevels = spec.facetLabels?.colsLevels || (spec.facetLabels?.cols ? [{ fieldLabel: spec.facetLabels.cols.fieldLabel, values: spec.facetLabels.cols.values }] : []);
    const rowLevels = spec.facetLabels?.rowsLevels || (spec.facetLabels?.rows ? [{ fieldLabel: spec.facetLabels.rows.fieldLabel, values: spec.facetLabels.rows.values }] : []);

    const baseCols = spec.facetLabels?.spans?.baseCols || spec.facetLabels?.groupSpan?.columnsPerFacet || 1;
    const baseRows = spec.facetLabels?.spans?.baseRows || spec.facetLabels?.groupSpan?.rowsPerFacet || 1;

    const computeSpan = (levelIdx: number, levels: Array<{ values: any[] }>, base: number) => {
      let span = base;
      for (let j = levelIdx + 1; j < levels.length; j++) {
        span *= (levels[j].values?.length || 1);
      }
      return span;
    };
    const computeRepeat = (levelIdx: number, levels: Array<{ values: any[] }>) => {
      let repeat = 1;
      for (let j = 0; j < levelIdx; j++) {
        repeat *= (levels[j].values?.length || 1);
      }
      return repeat;
    };

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

    // Wrapper grid: main 2 columns: a zero-width spacer + the content column
    const wrapperTemplateColumns = `0px 1fr`;

    const dividerColor = '#99a795';

    return (
      <div className={styles.container} ref={containerRef}>
        {/* Facet labels (optional) */}
        {spec.facetLabels ? (
          <div style={{ display: 'grid', gridTemplateColumns: wrapperTemplateColumns, gridTemplateRows: `auto 1fr`, gap: 0 }}>
            {/* Top-left corner empty cell */}
            <div />
            {/* Column facet labels (top) */}
            <div style={{ display: 'grid', gridTemplateColumns: `${leftLabelsPx}px ${Y_LABEL_COL_PX}px ${dynamicYAxisPx}px ${plotTemplateColumns}`, gridAutoRows: 'auto', gridColumn: 2 }}>
              {/* Names band (blue) across plot area only */}
              {colLevels.length > 0 ? (
                <div style={{ gridColumn: '4 / -1', textAlign: 'center', background: '#dbe9ff', padding: '2px 0', fontSize: '14px' }}>
                  {colLevels.map(l => l.fieldLabel).join(' / ')}
                </div>
              ) : null}
              {/* Value bands (green), outermost level first; explicit start and span */}
              {colLevels.map((level, levelIdx) => {
                const counts = colLevels.map(l => l.values.length);
                const innerProduct = counts.slice(levelIdx + 1).reduce((a, b) => a * b, 1) || 1;
                const outerProduct = counts.slice(0, levelIdx).reduce((a, b) => a * b, 1) || 1;
                const span = baseCols * innerProduct;
                const groupSpan = span * level.values.length;
                const cells: React.ReactNode[] = [];
                for (let r = 0; r < outerProduct; r++) {
                  const groupStart = r * groupSpan; // 0-based over the plot columns
                  level.values.forEach((val: any, i: number) => {
                    const startCol = 4 + groupStart + i * span; // charts start at col 4 in header
                    cells.push(
                      <div
                        key={`col-level-${levelIdx}-seg-${r}-val-${i}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: `${VALUES_BAND_TOP_PX}px`,
                          gridColumn: `${startCol} / span ${span}`,
                          background: '#e9f2e1',
                          borderBottom: `1px solid ${dividerColor}`,
                          borderRight: `1px solid ${dividerColor}`,
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
            {/* Plot grid with integrated labels + axis gutters */}
            <div
              className={styles.multiPlotGrid}
              style={{
                display: 'grid',
                gridTemplateColumns: `${leftLabelsPx}px ${Y_LABEL_COL_PX}px ${dynamicYAxisPx}px ${plotTemplateColumns}`,
                gridTemplateRows: `${plotTemplateRows} ${dynamicXAxisPx}px ${X_LABEL_ROW_PX}px`,
                gap: '0',
                padding: '0',
                alignItems: 'stretch',
                gridColumn: 2,
                gridRow: 2,
                overflow: 'visible',
              }}
            >
              {/* Left labels area as nested grid: blue names + one green column per Y-level */}
              <div
                style={{
                  gridColumn: 1,
                  gridRow: '1 / span ' + rows,
                  display: 'grid',
                  gridTemplateColumns: `${NAMES_BAND_LEFT_PX}px ${new Array(yLevelsCount).fill(`${VALUES_BAND_LEFT_PX}px`).join(' ')}`,
                  gridTemplateRows: plotTemplateRows,
                  alignItems: 'stretch',
                }}
              >
                {/* Blue names band spanning all rows */}
                {rowLevels.length > 0 && (
                  <div
                    style={{
                      gridColumn: 1,
                      gridRow: '1 / -1',
                      writingMode: 'vertical-rl',
                      transform: 'rotate(180deg)',
                      background: '#dbe9ff',
                      padding: '2px 0',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRight: '1px solid #99a795',
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
                            background: '#e9f2e1',
                            padding: 0,
                            overflow: 'hidden',
                          }}
                        >
                          <div style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', whiteSpace: 'nowrap', padding: '2px 0', fontSize: '14px' }}>{String(val)}</div>
                        </div>
                      );
                    });
                  }
                  return <React.Fragment key={`yval-level-${levelIdx}`}>{cells}</React.Fragment>;
                })}
              </div>

              {/* Y-axis vertical labels column (col 2) */}
              {Array.from({ length: rows }).map((_, r) => {
                const sample = (spec.plots || []).find((p) => p.position?.row === r);
                const yLabel = (sample as any)?.options?.y?.label as string | undefined;
                return (
                  <div
                    key={`y-label-${r}`}
                    style={{
                      gridColumn: 2,
                      gridRow: r + 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center', fontSize: '12px' }}>{yLabel || ''}</div>
                  </div>
                );
              })}

              {/* Left external y-axes gutter (col 3) */}
              {Array.from({ length: rows }).map((_, r) => {
                const sample = (spec.plots || []).find((p) => p.position?.row === r);
                const yDomain = (sample as any)?.options?.y?.domain;
                return (
                  <div key={`y-axis-${r}`} style={{ gridColumn: 3, gridRow: r + 1 }}>
                    <ObservablePlot options={buildYAxisOptions(yDomain, dynamicYAxisPx)} />
                  </div>
                );
              })}

              {/* Chart cells: start at col 4 */}
              {(spec.plots || []).map((plot, index) => {
                const key = plot.id || String(index);
                const pos = plot.position;
                const gridItemStyle: React.CSSProperties | undefined = pos
                  ? { gridColumn: (pos.col + 4), gridRow: pos.row + 1, borderRight: '1px solid #99a795', borderBottom: '1px solid #99a795' }
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

              {/* Bottom external x-axes gutter */}
              {Array.from({ length: columns }).map((_, c) => {
                const sample = (spec.plots || []).find((p) => p.position?.col === c);
                const xLabel = (sample as any)?.options?.x?.label;
                const xDomain = (sample as any)?.options?.x?.domain;
                return (
                  <div key={`x-axis-${c}`} style={{ gridColumn: c + 4, gridRow: rows + 1 }}>
                    <ObservablePlot options={buildXAxisOptions(xLabel, xDomain, dynamicXAxisPx)} />
                  </div>
                );
              })}

              {/* Bottom x labels row */}
              {Array.from({ length: columns }).map((_, c) => {
                const sample = (spec.plots || []).find((p) => p.position?.col === c);
                const xLabel = (sample as any)?.options?.x?.label as string | undefined;
                return (
                  <div key={`x-label-${c}`} style={{ gridColumn: c + 4, gridRow: rows + 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '12px' }}>{xLabel || ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Non-faceted, axis gutter wrapper as well
          <div
            className={styles.multiPlotGrid}
            style={{
              display: 'grid',
              gridTemplateColumns: `${Y_LABEL_COL_PX}px ${computeDynamicYAxisGutterPx(spec, rows)}px ${plotTemplateColumns}`,
              gridTemplateRows: `${plotTemplateRows} ${computeDynamicXAxisGutterPx(spec, columns)}px ${X_LABEL_ROW_PX}px`,
              gap: '0',
              padding: '0',
              overflow: 'visible',
            }}
          >
            {/* Y label column */}
            {Array.from({ length: rows }).map((_, r) => {
              const sample = (spec.plots || []).find((p) => p.position?.row === r);
              const yLabel = (sample as any)?.options?.y?.label as string | undefined;
              return (
                <div key={`y-label-single-${r}`} style={{ gridColumn: 1, gridRow: r + 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center', fontSize: '12px' }}>{yLabel || ''}</div>
                </div>
              );
            })}
            {/* External y-axes (single) */}
            {Array.from({ length: rows }).map((_, r) => {
              const sample = (spec.plots || []).find((p) => p.position?.row === r);
              const yDomain = (sample as any)?.options?.y?.domain;
              return (
                <div key={`y-axis-single-${r}`} style={{ gridColumn: 2, gridRow: r + 1 }}>
                  <ObservablePlot options={buildYAxisOptions(yDomain, computeDynamicYAxisGutterPx(spec, rows))} />
                </div>
              );
            })}
            {/* Charts */}
            {(spec.plots || []).map((plot, index) => {
              const key = plot.id || String(index);
              const pos = plot.position;
              const gridItemStyle: React.CSSProperties | undefined = pos
                ? { gridColumn: pos.col + 3, gridRow: pos.row + 1, borderRight: '1px solid #99a795', borderBottom: '1px solid #99a795' }
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
            {/* External x-axes (single) */}
            {Array.from({ length: columns }).map((_, c) => {
              const sample = (spec.plots || []).find((p) => p.position?.col === c);
              const xLabel = (sample as any)?.options?.x?.label;
              const xDomain = (sample as any)?.options?.x?.domain;
              return (
                <div key={`x-axis-single-${c}`} style={{ gridColumn: c + 3, gridRow: rows + 1 }}>
                  <ObservablePlot options={buildXAxisOptions(xLabel, xDomain, computeDynamicXAxisGutterPx(spec, columns))} />
                </div>
              );
            })}
            {/* Bottom x labels row */}
            {Array.from({ length: columns }).map((_, c) => {
              const sample = (spec.plots || []).find((p) => p.position?.col === c);
              const xLabel = (sample as any)?.options?.x?.label as string | undefined;
              return (
                <div key={`x-label-single-${c}`} style={{ gridColumn: c + 3, gridRow: rows + 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '12px' }}>{xLabel || ''}</div>
                </div>
              );
            })}
          </div>
        )}
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
