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
    const NAMES_BAND_LEFT_PX = 56; // width of blue names band on the left
    const VALUES_BAND_LEFT_PX = 48; // width of green values column on the left
    const VALUES_BAND_TOP_PX = 32; // height of green values row on the top

    // Wrapper grid: hide the legacy left cell (0px) and keep plots on the right
    const wrapperTemplateColumns = `0px 1fr`;

    return (
      <div className={styles.container} ref={containerRef}>
        {/* Facet labels (optional) */}
        {spec.facetLabels ? (
          <div style={{ display: 'grid', gridTemplateColumns: wrapperTemplateColumns, gridTemplateRows: `auto 1fr`, gap: 0 }}>
            {/* Top-left corner empty cell */}
            <div />
            {/* Column facet labels (top) */}
            <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, gridAutoRows: 'auto', gridColumn: 2 }}>
              {/* Names band (blue) */}
              {colLevels.length > 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', background: '#dbe9ff', padding: '4px 0', fontWeight: 600 }}>
                  {colLevels.map(l => l.fieldLabel).join(' / ')}
                </div>
              ) : null}
              {/* Value bands (green), outermost level first */}
              {colLevels.map((level, levelIdx) => {
                const span = computeSpan(levelIdx, colLevels, baseCols);
                const reps = computeRepeat(levelIdx, colLevels);
                const cells: React.ReactNode[] = [];
                for (let r = 0; r < reps; r++) {
                  level.values.forEach((val: any, i: number) => {
                    cells.push(
                      <div
                        key={`col-level-${levelIdx}-seg-${r}-val-${i}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: `${VALUES_BAND_TOP_PX}px`,
                          gridColumn: `span ${span}`,
                          background: '#e9f2e1',
                          borderBottom: levelIdx === colLevels.length - 1 ? '1px solid #c9d7c5' : 'none',
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
                gridTemplateColumns: `${NAMES_BAND_LEFT_PX + VALUES_BAND_LEFT_PX}px ${plotTemplateColumns}`,
                gridTemplateRows,
                gap: '0',
                padding: '0',
                alignItems: 'stretch',
                gridColumn: 2,
                gridRow: 2,
              }}
            >
              {/* Left blue names band spanning all rows */}
              {rowLevels.length > 0 && (
                <div
                  style={{
                    gridColumn: 1,
                    gridRow: '1 / -1',
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    background: '#dbe9ff',
                    padding: '4px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {rowLevels.map(l => l.fieldLabel).join(' / ')}
                </div>
              )}
              {/* Left green values bands, aligned with rows using explicit gridRow start/span */}
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
                          gridColumn: 1,
                          gridRow: `${startRow} / span ${span}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRight: levelIdx === rowLevels.length - 1 ? '1px solid #c9d7c5' : 'none',
                          background: '#e9f2e1',
                          width: `${VALUES_BAND_LEFT_PX}px`,
                          marginLeft: `${NAMES_BAND_LEFT_PX}px`,
                        }}
                      >
                        <div style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>{String(val)}</div>
                      </div>
                    );
                  });
                }
                return <React.Fragment key={`yval-level-${levelIdx}`}>{cells}</React.Fragment>;
              })}

              {/* Plot cells shifted by +1 column (since column 1 holds labels) */}
              {spec.plots.map((plot, index) => {
                const key = plot.id || String(index);
                const pos = plot.position;
                const gridItemStyle: React.CSSProperties | undefined = pos
                  ? { gridColumn: (pos.col + 2), gridRow: pos.row + 1 }
                  : undefined;
                return (
                  <div key={key} className={styles.plotWrapper} style={gridItemStyle}>
                    <div className={styles.observablePlotContainer}>
                      <ObservablePlot options={plot.options} />
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
            }}
          >
            {spec.plots.map((plot, index) => {
              const key = plot.id || String(index);
              const pos = plot.position;
              const gridItemStyle: React.CSSProperties | undefined = pos
                ? { gridColumn: pos.col + 1, gridRow: pos.row + 1 }
                : undefined;
              return (
                <div key={key} className={styles.plotWrapper} style={gridItemStyle}>
                  <div className={styles.observablePlotContainer}>
                    <ObservablePlot options={plot.options} />
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
