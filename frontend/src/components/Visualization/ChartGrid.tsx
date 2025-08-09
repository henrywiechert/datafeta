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

  // Handle multi-plot scenarios
  if (spec.plots && spec.plots.length > 0) {
    const isVerticalLayout = spec.layout?.type === 'vertical';
    
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.multiPlotGrid} style={{
          display: 'grid',
          gridTemplateColumns: isVerticalLayout ? '1fr' : `repeat(${spec.layout?.columns || 2}, 1fr)`,
          gridTemplateRows: isVerticalLayout ? `repeat(${spec.layout?.rows || 2}, 1fr)` : '1fr',
          gap: '0', /* Remove spacing between plots */
          padding: '0'
        }}>
          {spec.plots.map((plot, index) => (
            <div key={plot.id || index} className={styles.plotWrapper}>
              <h4 className={styles.plotTitle}>{plot.title}</h4>
              <div className={styles.observablePlotContainer}>
                <ObservablePlot options={plot.options} />
              </div>
            </div>
          ))}
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
