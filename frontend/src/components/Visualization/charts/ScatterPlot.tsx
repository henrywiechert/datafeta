import React from 'react';
import { CellSpec } from '../../../spec-generator/specGenerator';

interface ChartProps {
  cellSpec: CellSpec;
  // data: any[];
}

const ScatterPlot: React.FC<ChartProps> = ({ cellSpec }) => {
  const { encoding } = cellSpec;
  return (
    <div style={{ padding: '8px', border: '1p solid #eee', height: '100%' }}>
      <p>Scatter Plot</p>
      <p>
        X: {encoding.x?.columnName || ' (none)'}
      </p>
      <p>
        Y: {encoding.y?.columnName || ' (none)'}
      </p>
    </div>
  );
};

export default ScatterPlot;
