import React, { useRef } from 'react';

import { QueryResult } from '../../types';
import { PlotResult } from '../../observable-plot-generator/types';
import ObservablePlot from './ObservablePlot';
import styles from './ChartGrid.module.css';

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

    const MIN_COLUMN_PX = 240;
    const MIN_ROW_PX = 160;

    const gridTemplateColumns =
      layoutType === 'vertical'
        ? '1fr'
        : columnSizes && columnSizes.length > 0
          ? columnSizes
              .slice(0, columns)
              .map((c) => (typeof c === 'number' ? `${c}px` : `minmax(${MIN_COLUMN_PX}px, 1fr)`))
              .join(' ')
          : `repeat(${columns}, 1fr)`;

    const gridTemplateRows =
      layoutType === 'horizontal'
        ? '1fr'
        : rowSizes && rowSizes.length > 0
          ? rowSizes
              .slice(0, rows)
              .map((r) => (typeof r === 'number' ? `${r}px` : `minmax(${MIN_ROW_PX}px, 1fr)`))
              .join(' ')
          : `repeat(${rows}, 1fr)`;

    return (
      <div className={styles.container} ref={containerRef}>
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
