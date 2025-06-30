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
  
  // Vega-Lite expects an array of objects, not an array of arrays.
  // We need to transform our data.
  const chartData = data.rows.map(row => {
    const newRow: { [key: string]: any } = {};
    data.columns.forEach((col, i) => {
      newRow[col] = row[i];
    });
    return newRow;
  });

  return (
    <div className={styles.container}>
      <Vega spec={spec} data={{ table: chartData }} />
    </div>
  );
};

export default ChartGrid;
