import React from 'react';
import { CellSpec } from '../../spec-generator/specGenerator';
import BarChart from './charts/BarChart';
import ScatterPlot from './charts/ScatterPlot';
import { QueryResult } from '../../types';

interface ChartCellProps {
  cellSpec: CellSpec;
  data: QueryResult['rows'];
}

const ChartCell: React.FC<ChartCellProps> = ({ cellSpec, data }) => {
  const { chartType } = cellSpec;

  switch (chartType) {
    case 'bar':
      return <BarChart cellSpec={cellSpec} data={data} />;
    case 'scatter':
      return <ScatterPlot cellSpec={cellSpec} data={data} />;
    case 'table':
      return <div>Table View ({data.length} rows)</div>; // Placeholder
    default:
      return <div>Unknown Chart Type</div>;
  }
};

export default ChartCell;
