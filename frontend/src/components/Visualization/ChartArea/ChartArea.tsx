import React, { useCallback } from 'react';
import { Box } from '@mui/material';
import styles from '../ChartArea.module.css';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useChartGeneration, useQueryExecution, useDataProcessing, useDebugView } from './hooks';
import { ChartRenderer, ChartControls, DebugPanel } from './components';
import { validateAndCleanData } from './utils';

/**
 * Simplified ChartArea component that orchestrates the extracted hooks and components
 * 
 * This component replaces the original 434-line ChartArea.tsx with a much simpler
 * orchestrator that delegates responsibilities to specialized hooks and components.
 */
const ChartArea: React.FC = () => {
  const { state, dispatch, startOperation, completeOperation } = useVisualizationContext();
  const { xAxisFields, yAxisFields, selectedTable, selectedDatabase, queryResult, queryError } = state;

  // Use the extracted data processing hook
  const { useTableView, tableData } = useDataProcessing({
    xAxisFields,
    yAxisFields,
    queryResult,
  });

  // Memoize the dispatch wrapper to prevent infinite loops
  const memoizedDispatch = useCallback((action: any) => {
    // Handle data cleaning before dispatching query results
    if (action.type === 'SET_QUERY_RESULT' && action.payload) {
      const cleanedResult = validateAndCleanData(action.payload);
      dispatch({ ...action, payload: cleanedResult });
    } else {
      dispatch(action);
    }
  }, [dispatch]);

  // Use the extracted query execution hook
  const { queryDescription } = useQueryExecution({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    startOperation,
    completeOperation,
    dispatch: memoizedDispatch,
  });

  // Use the extracted chart generation hook
  const { spec, chartInfo, renderingError } = useChartGeneration({
    xAxisFields,
    yAxisFields,
    useTableView,
    startOperation,
    completeOperation,
  });

  // Use the extracted debug view hook
  const { isDebugOpen, debugHeight, maxDebugHeight, toggleDebugView, handleDebugResize } = useDebugView();

  return (
    <div className={styles.container}>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
        <ChartRenderer
          useTableView={useTableView}
          tableData={tableData}
          spec={spec}
          queryResult={queryResult}
          xAxisFields={xAxisFields}
          yAxisFields={yAxisFields}
        />
        
        <ChartControls
          isDebugOpen={isDebugOpen}
          onToggleDebug={toggleDebugView}
        />
        
        <DebugPanel
          isDebugOpen={isDebugOpen}
          debugHeight={debugHeight}
          maxDebugHeight={maxDebugHeight}
          onDebugResize={handleDebugResize}
          queryDescription={queryDescription}
          queryResult={queryResult}
          queryError={queryError}
          vegaSpec={spec}
          chartInfo={chartInfo}
          renderingError={renderingError}
        />
      </Box>
    </div>
  );
};

export default ChartArea; 