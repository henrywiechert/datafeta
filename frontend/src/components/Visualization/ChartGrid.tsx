import React, { useRef } from 'react';

import { QueryResult } from '../../types';
import { PlotResult } from '../../observable-plot-generator/types';
import ObservablePlot from './ObservablePlot';
import styles from './ChartGrid.module.css';

interface ChartGridProps {
  spec: any; // Allow both Vega and Vega-Lite specs
  data: QueryResult | null;
}

/**
 * ChartGrid - Universal chart renderer for both Vega and Vega-Lite
 * 
 * ARCHITECTURE NOTE: This component handles BOTH chart types but keeps their logic separate:
 * - Vega-Lite: Uses built-in responsive sizing ("width": "container")
 * - Vega: Uses custom dimension management and signal updates
 * 
 * Detection: spec.$schema.includes('vega-lite') determines chart type
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

  // Handle Observable Plot rendering
  return (
    <div className={`${styles.container} ${styles.observablePlotContainer}`} ref={containerRef}>
      <ObservablePlot options={(spec as PlotResult).options} />
    </div>
  );
};

export default ChartGrid;
