import React, { useContext } from 'react';
import { Field } from '../../types';
import { useVisualizationContext } from '../../contexts/VisualizationContext';

interface ChartGridProps {
  xDimensions: Field[];
  yDimensions: Field[];
  xMeasures: Field[];
  yMeasures: Field[];
}

const ChartGrid: React.FC<ChartGridProps> = ({
  xDimensions,
  yDimensions,
  xMeasures,
  yMeasures,
}) => {
  const { state } = useVisualizationContext();
  const { queryResult, queryError } = state;

  if (queryError) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h3>Error Fetching Data</h3>
        <pre>{queryError}</pre>
      </div>
    );
  }

  if (!queryResult) {
    return <div>Drop fields on X/Y axes to build a chart.</div>;
  }

  // TODO: Implement grid logic

  return (
    <div>
      <p>ChartGrid will be implemented here.</p>
      <pre>{JSON.stringify(queryResult, null, 2)}</pre>
    </div>
  );
};

export default ChartGrid;
