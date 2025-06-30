import React from 'react';
import { CellSpec } from '../../../spec-generator/specGenerator';
import { QueryResult } from '../../../types';

interface ChartProps {
  cellSpec: CellSpec;
  data: QueryResult['rows'];
}

const BarChart: React.FC<ChartProps> = ({ cellSpec, data }) => {
  const { encoding, orientation } = cellSpec;
  return (
    <div style={{ padding: '8px', border: '1px solid #eee', height: '100%' }}>
      <p>Bar Chart ({orientation})</p>
      <p>
        X: {encoding.x?.columnName || ' (none)'}
      </p>
      <p>
        Y: {encoding.y?.columnName || ' (none)'}
      </p>
      <p>{data.length} rows</p>
    </div>
  );
};

export default BarChart;
