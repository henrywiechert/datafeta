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

    const gridTemplateColumns =
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

    return (
      <div className={styles.container} ref={containerRef}>
        {/* Facet labels (optional) */}
        {spec.facetLabels ? (
          <div style={{ display: 'grid', gridTemplateColumns: `auto 1fr`, gridTemplateRows: `auto 1fr`, gap: 0 }}>
            {/* Top-left corner empty cell */}
            <div />
            {/* Column facet labels (top) */}
            {spec.facetLabels.colsLevels ? (
              <div style={{ display: 'grid', gridAutoRows: 'auto', gridTemplateColumns }}>
                {spec.facetLabels.colsLevels.map((level, levelIdx) => (
                  <React.Fragment key={`col-level-${levelIdx}`}>
                    {level.values.map((val: any, i: number) => {
                      const span = spec.facetLabels?.spans?.columns?.[levelIdx] || spec.facetLabels?.groupSpan?.columnsPerFacet || 1;
                      return (
                        <div
                          key={`col-level-${levelIdx}-val-${i}`}
                          style={{
                            textAlign: 'center',
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            gridColumn: `span ${span}`,
                          }}
                        >
                          <strong>{level.fieldLabel}</strong>
                          <div>{String(val)}</div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            ) : spec.facetLabels.cols ? (
              <div style={{ display: 'grid', gridTemplateColumns, gridAutoRows: 'auto' }}>
                {spec.facetLabels.cols.values.map((val: any, i: number) => (
                  <div key={`col-label-${i}`} style={{ textAlign: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    <strong>{spec.facetLabels!.cols!.fieldLabel}</strong>
                    <div>{String(val)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div />
            )}
            {/* Row facet labels (left) */}
            {spec.facetLabels.rowsLevels ? (
              <div style={{ display: 'grid', gridAutoFlow: 'row', gridTemplateRows }}>
                {spec.facetLabels.rowsLevels.map((level, levelIdx) => (
                  <React.Fragment key={`row-level-${levelIdx}`}>
                    {level.values.map((val: any, i: number) => {
                      const span = spec.facetLabels?.spans?.rows?.[levelIdx] || spec.facetLabels?.groupSpan?.rowsPerFacet || 1;
                      return (
                        <div
                          key={`row-level-${levelIdx}-val-${i}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gridRow: `span ${span}` }}
                        >
                          <div>
                            <strong>{level.fieldLabel}</strong>
                            <div>{String(val)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            ) : spec.facetLabels.rows ? (
              <div style={{ display: 'grid', gridTemplateRows, gridAutoFlow: 'row' }}>
                {spec.facetLabels.rows.values.map((val: any, i: number) => (
                  <div key={`row-label-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                    <div>
                      <strong>{spec.facetLabels!.rows!.fieldLabel}</strong>
                      <div>{String(val)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div />
            )}
            {/* Plot grid */}
            <div
              className={styles.multiPlotGrid}
              style={{
                display: 'grid',
                gridTemplateColumns,
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
          </div>
        ) : (
          <div
            className={styles.multiPlotGrid}
            style={{
              display: 'grid',
              gridTemplateColumns,
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
