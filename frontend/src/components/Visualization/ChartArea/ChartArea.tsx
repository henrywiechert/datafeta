import React, { useRef } from 'react';
import styles from '../ChartArea.module.css';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useChartGeneration, useQueryExecution, useDataProcessing, useDebugView, useFullscreen } from './hooks';
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
  const {
    xAxisFields,
    yAxisFields,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    sizeField,
    sizeRange,
    manualSize,
    queryResult,
    queryError,
    appliedFilterConfigurations,
    labelFields,
    labelsEnabled,
    labelSamplingStrategy,
    labelSamplingThreshold,
    labelSampleEvery,
    virtualColumns,
    fieldOverrides,
  } = state as any;
  const { selectedTable, selectedDatabase, virtualTable } = dataSource;
  
  // Ref for the fullscreen target element
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  // Collect additional color/size fields from field overrides
  const additionalColorFields = React.useMemo(() => {
    const fields: any[] = [];
    Object.values(fieldOverrides || {}).forEach((override: any) => {
      if (override.colorField && !fields.some((f: any) => f.id === override.colorField.id)) {
        fields.push(override.colorField);
      }
    });
    console.log('[ChartArea] additionalColorFields:', fields.map((f: any) => f.columnName));
    return fields;
  }, [fieldOverrides]);

  const additionalSizeFields = React.useMemo(() => {
    const fields: any[] = [];
    Object.values(fieldOverrides || {}).forEach((override: any) => {
      if (override.sizeField && !fields.some((f: any) => f.id === override.sizeField.id)) {
        fields.push(override.sizeField);
      }
    });
    console.log('[ChartArea] additionalSizeFields:', fields.map((f: any) => f.columnName));
    return fields;
  }, [fieldOverrides]);

  // Use the extracted data processing hook
  const { useTableView, tableData } = useDataProcessing({
    xAxisFields,
    yAxisFields,
    queryResult,
  });

  // Use the extracted query execution hook
  const { queryDescription, optimizationHints } = useQueryExecution({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    filterConfigurations: appliedFilterConfigurations,
    labelFields,
    virtualTable,
    virtualColumns,
    startOperation,
    completeOperation,
    dispatch,
    additionalColorFields,
    additionalSizeFields,
  });

  // Use the extracted chart generation hook
  const { spec, chartInfo, renderingError } = useChartGeneration({
    xAxisFields,
    yAxisFields,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    sizeField,
    sizeRange,
    manualSize,
    useTableView,
    queryResult, // Pass queryResult here
    startOperation,
    completeOperation,
    labelFields,
    labelsEnabled,
    labelSamplingStrategy,
    labelSamplingThreshold,
    labelSampleEvery,
    fieldOverrides,
  });

  // Use the extracted debug view hook
  const { isDebugOpen, debugHeight, maxDebugHeight, toggleDebugView, handleDebugResize } = useDebugView();
  
  // Use the fullscreen hook
  const { isFullscreen, toggleFullscreen, isSupported: isFullscreenSupported } = useFullscreen(chartWrapperRef);

  const debugData = {
    queryDescription,
    queryResult,
    queryError,
    spec: spec,
    chartInfo,
    renderingError,
    optimizationHints,
  };

  return (
    <div className={styles.container}>
      <div 
        ref={chartWrapperRef}
        className={`${styles.chartWrapper} ${isFullscreen ? styles.fullscreen : ''}`}
      >
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
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isFullscreenSupported={isFullscreenSupported}
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