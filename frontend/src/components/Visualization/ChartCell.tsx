import React from 'react';
import { CellSpec } from '../../spec-generator/specGenerator';
import BarChart from './charts/BarChart';
import ScatterPlot from './charts/ScatterPlot';

interface ChartCellProps {
  cellSpec: CellSpec;
  // data: any[]; // We will add sliced data later
}

const ChartCell: React.FC<ChartCellProps> = ({ cellSpec }) => {
  const { chartType } = cellSpec;

  switch (chartType) {
    case 'bar':
      return <BarChart cellSpec={cellSpec} />;
    case 'scatter':
      return <ScatterPlot cellSpec={cellSpec} />;
    case 'table':
      return <div>Table View</div>; // Placeholder
    default:
      return <div>Unknown Chart Type</div>;
  }
};

export default ChartCell;
