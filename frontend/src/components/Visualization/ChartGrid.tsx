import React from 'react';
import { GridSpec } from '../../spec-generator/specGenerator';
import styles from './ChartGrid.module.css';

interface ChartGridProps {
  gridSpec: GridSpec;
}

const ChartGrid: React.FC<ChartGridProps> = ({ gridSpec }) => {
  const { cell, facets, errors } = gridSpec;

  if (errors) {
    return (
      <div>
        <h2>{errors[0].title}</h2>
        <p>{errors[0].message}</p>
      </div>
    );
  }

  // TODO: Implement faceting logic based on facets.rows and facets.columns
  // For now, we just render a single chart cell.

  return (
    <div className={styles.container}>
      {/* This is a placeholder to show the chart type */}
      <h1>Chart Type: {cell.chartType}</h1>
    </div>
  );
};

export default ChartGrid;
