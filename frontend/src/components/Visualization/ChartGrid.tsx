import React from 'react';
import { Vega } from 'react-vega';
import { VegaLiteSpec } from '../../spec-generator/specGenerator';
import { QueryResult } from '../../types';
import styles from './ChartGrid.module.css';

interface ChartGridProps {
  spec: VegaLiteSpec;
  data: QueryResult | null;
}

const ChartGrid: React.FC<ChartGridProps> = ({ spec, data }) => {
  if (!data || !data.rows || data.rows.length === 0) {
    return (
      <div className={styles.container}>
        <p>No data to display. Drag fields to the axes to create a chart.</p>
      </div>
    );
  }
  
  // The backend already returns rows as an array of objects, which is exactly what Vega-Lite expects!
  // No transformation needed - just use the data directly
  const chartData = data.rows;

  return (
    <div className={styles.container}>
      <Vega 
        spec={spec} 
        data={{ table: chartData }} 
        actions={false}
        renderer="svg"
      />
    </div>
  );
};

export default ChartGrid;
