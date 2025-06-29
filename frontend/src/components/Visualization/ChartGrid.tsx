import React, { useContext } from 'react';
import { Field, QueryDescription } from '../../types';
import { useVisualizationContext } from '../../contexts/VisualizationContext';
import DebugView from './DebugView';
// We are keeping the CSS import for now, in case we add grid-specific styles later
import styles from './ChartGrid.module.css';

interface ChartGridProps {
  queryDescription: QueryDescription | null;
  // The other dimension/measure props are kept for when we implement the actual charts
  xDimensions: Field[];
  yDimensions: Field[];
  xMeasures: Field[];
  yMeasures: Field[];
}

const ChartGrid: React.FC<ChartGridProps> = ({
  queryDescription,
  xDimensions,
  yDimensions,
  xMeasures,
  yMeasures,
}) => {
  const { state } = useVisualizationContext();
  const { queryResult, queryError } = state;
  
  // For now, we will always render the DebugView.
  // Later, we can add a switch here.
  return (
    <DebugView 
      queryDescription={queryDescription}
      queryResult={queryResult}
      queryError={queryError}
    />
  );
};

export default ChartGrid;
