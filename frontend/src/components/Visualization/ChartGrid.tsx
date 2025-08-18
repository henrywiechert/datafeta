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
 * Remove axis labels (preserve light ticks/grid).
 */
function suppressAxes(options: any, hideX: boolean, hideY: boolean) {
  const next = { ...options };
  if (hideX) {
    next.x = {
      ...(next.x || {}),
      label: '',
      tickFormat: () => '',
      tickSize: typeof (next.x || {}).tickSize === 'number' ? (next.x || {}).tickSize : 3,
    };
  }
  if (hideY) {
    next.y = {
      ...(next.y || {}),
      label: '',
      tickFormat: () => '',
      tickSize: typeof (next.y || {}).tickSize === 'number' ? (next.y || {}).tickSize : 3,
    };
  }
  return next;
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

    const gridTemplateRows =
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

    // Sizing constants for label bands
    const NAMES_BAND_LEFT_PX = 20; // width of blue names band on the left
    const VALUES_BAND_LEFT_PX = 20; // width per green values column (per level) on the left
    const VALUES_BAND_TOP_PX = 20; // height of green values row on the top

    const yLevelsCount = rowLevels.length;
    const leftSpacerPx = NAMES_BAND_LEFT_PX + VALUES_BAND_LEFT_PX * yLevelsCount;

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
            <div style={{ display: 'grid', gridTemplateColumns: `${leftSpacerPx}px ${plotTemplateColumns}`, gridAutoRows: 'auto', gridColumn: 2 }}>
              {/* Names band (blue) across plot area only */}
              {colLevels.length > 0 ? (
                <div style={{ gridColumn: '2 / -1', textAlign: 'center', background: '#dbe9ff', padding: '2px 0', fontSize: '14px' }}>
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
                    const startCol = 2 + groupStart + i * span; // +2 accounts for left spacer column
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
            {/* Plot grid with integrated Y-axis labels in the same grid */}
            <div
              className={styles.multiPlotGrid}
              style={{
                display: 'grid',
                gridTemplateColumns: `${leftSpacerPx}px ${plotTemplateColumns}`,
                gridTemplateRows,
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
                  gridRow: '1 / -1',
                  display: 'grid',
                  gridTemplateColumns: `${NAMES_BAND_LEFT_PX}px ${new Array(yLevelsCount).fill(`${VALUES_BAND_LEFT_PX}px`).join(' ')}`,
                  gridTemplateRows,
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

              {/* Plot cells shifted by +1 column (since column 1 holds labels) */}
              {spec.plots.map((plot, index) => {
                const key = plot.id || String(index);
                const pos = plot.position;
                const gridItemStyle: React.CSSProperties | undefined = pos
                  ? { gridColumn: (pos.col + 2), gridRow: pos.row + 1 }
                  : undefined;

                // Axis suppression for matrix: hide x except bottom row, hide y except left col
                const hideX = rows > 1 && !!pos && pos.row < rows - 1;
                const hideY = columns > 1 && !!pos && pos.col > 0;
                const opts = suppressAxes(plot.options, hideX, hideY);

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
        ) : (
          <div
            className={styles.multiPlotGrid}
            style={{
              display: 'grid',
              gridTemplateColumns: plotTemplateColumns,
              gridTemplateRows,
              gap: '0',
              padding: '0',
              overflow: 'visible',
            }}
          >
            {spec.plots.map((plot, index) => {
              const key = plot.id || String(index);
              const pos = plot.position;
              const gridItemStyle: React.CSSProperties | undefined = pos
                ? { gridColumn: pos.col + 1, gridRow: pos.row + 1 }
                : undefined;
            
              // Axis suppression for matrix case
              const hideX = rows > 1 && !!pos && pos.row < rows - 1;
              const hideY = columns > 1 && !!pos && pos.col > 0;
              const opts = suppressAxes(plot.options, hideX, hideY);

              return (
                <div key={key} className={styles.plotWrapper} style={gridItemStyle}>
                  <div className={styles.observablePlotContainer}>
                    <ObservablePlot options={opts} />
                  </div>
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
