import React from 'react';
import styles from '../ChartArea.module.css';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useChartGeneration, useQueryExecution, useDataProcessing, useDebugView } from './hooks';
import { ChartRenderer, ChartControls, DebugPanel } from './components';

/**
 * Simplified ChartArea component that orchestrates the extracted hooks and components
 * 
 * This component replaces the original 434-line ChartArea.tsx with a much simpler
 * orchestrator that delegates responsibilities to specialized hooks and components.
 */
const ChartArea: React.FC = () => {
  const { state, dispatch, startOperation, completeOperation } = useVisualizationContext();
  const { dataSource } = useDataSource();
  const { xAxisFields, yAxisFields, colorField, colorScheme, sizeField, sizeRange, manualSize, queryResult, queryError, appliedFilterConfigurations } = state;
  const { selectedTable, selectedDatabase } = dataSource;

  // Use the extracted data processing hook
  const { useTableView, tableData } = useDataProcessing({
    xAxisFields,
    yAxisFields,
    queryResult,
  });

  // Use the extracted query execution hook
  const { queryDescription } = useQueryExecution({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    filterConfigurations: appliedFilterConfigurations,
    startOperation,
    completeOperation,
    dispatch,
  });

  // Use the extracted chart generation hook
  const { spec, chartInfo, renderingError } = useChartGeneration({
    xAxisFields,
    yAxisFields,
    colorField,
    colorScheme,
    sizeField,
    sizeRange,
    manualSize,
    useTableView,
    queryResult, // Pass queryResult here
    startOperation,
    completeOperation,
  });

  // Use the extracted debug view hook
  const { isDebugOpen, debugHeight, maxDebugHeight, toggleDebugView, handleDebugResize } = useDebugView();

  const debugData = {
    queryDescription,
    queryResult,
    queryError,
    spec: spec,
    chartInfo,
    renderingError,
  };

  return (
    <div className={styles.container}>
      <div className={styles.chartWrapper}>
        <ChartRenderer
          useTableView={useTableView}
          tableData={tableData}
          spec={spec}
          queryResult={queryResult}
          xAxisFields={xAxisFields}
          yAxisFields={yAxisFields}
          isDebugOpen={isDebugOpen}
          debugHeight={debugHeight}
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
          debugData={debugData}
        />
      </div>
    </div>
  );
};

export default ChartArea; 