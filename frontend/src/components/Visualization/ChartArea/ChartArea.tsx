import React, { useRef, useCallback, useLayoutEffect } from 'react';
import styles from '../ChartArea.module.css';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useSheetContext } from '../../../contexts/SheetContext';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { useRenderingCoordinator } from '../../../hooks/useRenderingCoordinator';
import { useChartGeneration, useQueryExecution, useDataProcessing, useDebugView, useFullscreen } from './hooks';
import { ChartRenderer, ChartControls, DebugPanel } from './components';

/**
 * Simplified ChartArea component that orchestrates the extracted hooks and components
 * 
 * This component replaces the original 434-line ChartArea.tsx with a much simpler
 * orchestrator that delegates responsibilities to specialized hooks and components.
 */
const ChartArea: React.FC = () => {
  const { state, dispatch, startOperation, completeOperation, getUndoableSnapshot } = useVisualizationContext();
  const { recordAction, undo, completeUndo, redo, completeRedo, canUndo, canRedo } = useUndoRedo();
  const { dataSource } = useDataSource();
  const { resetWorkspace } = useSheetContext();
  const renderingCoordinator = useRenderingCoordinator();
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
    queryVersion,
    appliedFilterConfigurations,
    labelFields,
    labelsEnabled,
    labelSamplingStrategy,
    labelSamplingThreshold,
    labelSampleEvery,
    tooltipFields,
    virtualColumns,
    fieldOverrides,
    globalChartType,
    measureValuesSourceFields,
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
    return fields;
  }, [fieldOverrides]);

  const additionalSizeFields = React.useMemo(() => {
    const fields: any[] = [];
    Object.values(fieldOverrides || {}).forEach((override: any) => {
      if (override.sizeField && !fields.some((f: any) => f.id === override.sizeField.id)) {
        fields.push(override.sizeField);
      }
    });
    return fields;
  }, [fieldOverrides]);

  const additionalLabelFields = React.useMemo(() => {
    const fields: any[] = [];
    Object.values(fieldOverrides || {}).forEach((override: any) => {
      if (override.labelFields) {
        override.labelFields.forEach((labelField: any) => {
          if (!fields.some((f: any) => f.id === labelField.id)) {
            fields.push(labelField);
          }
        });
      }
    });
    return fields;
  }, [fieldOverrides]);

  // Use the extracted data processing hook
  const { useTableView, tableData } = useDataProcessing({
    xAxisFields,
    yAxisFields,
    queryResult,
  });

  // Use the extracted query execution hook
  const { queryDescription, optimizationHints, lastQueryDecision } = useQueryExecution({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    filterConfigurations: appliedFilterConfigurations,
    labelFields,
    tooltipFields,
    virtualTable,
    virtualColumns,
    startOperation,
    completeOperation,
    dispatch,
    additionalColorFields,
    additionalSizeFields,
    additionalLabelFields,
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
    queryVersion, // Pass queryVersion to detect UNION/JOIN changes
    startOperation,
    completeOperation,
    labelFields,
    labelsEnabled,
    labelSamplingStrategy,
    labelSamplingThreshold,
    labelSampleEvery,
    tooltipFields,
    fieldOverrides,
    globalChartType,
    measureValuesSourceFields,
  });

  // Use the extracted debug view hook
  const { isDebugOpen, debugHeight, maxDebugHeight, toggleDebugView, handleDebugResize } = useDebugView();
  
  // Use the fullscreen hook
  const { isFullscreen, toggleFullscreen, isSupported: isFullscreenSupported } = useFullscreen(chartWrapperRef);

  // Handle swapping X and Y axes
  const handleSwapAxis = useCallback(() => {
    // Record current state for undo
    recordAction(getUndoableSnapshot());
    
    // Dispatch the swap action
    dispatch({ type: 'SWAP_AXIS_FIELDS' });
  }, [recordAction, getUndoableSnapshot, dispatch]);

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    const previousState = undo();
    if (previousState) {
      // Save current state before undoing
      const currentState = getUndoableSnapshot();
      
      // Restore previous state
      dispatch({
        type: 'RESTORE_UNDOABLE_STATE',
        payload: {
          ...previousState,
          virtualColumns: previousState.virtualColumns || [],
          virtualColumnFieldPreferences: previousState.virtualColumnFieldPreferences || {},
          fieldOverrides: previousState.fieldOverrides || {},
        }
      });
      
      // Complete the undo operation
      completeUndo(currentState);
    }
  }, [undo, completeUndo, dispatch, getUndoableSnapshot]);

  const handleRedo = useCallback(() => {
    const nextState = redo();
    if (nextState) {
      // Save current state before redoing
      const currentState = getUndoableSnapshot();
      
      // Restore next state
      dispatch({
        type: 'RESTORE_UNDOABLE_STATE',
        payload: {
          ...nextState,
          virtualColumns: nextState.virtualColumns || [],
          virtualColumnFieldPreferences: nextState.virtualColumnFieldPreferences || {},
          fieldOverrides: nextState.fieldOverrides || {},
        }
      });
      
      // Complete the redo operation
      completeRedo(currentState);
    }
  }, [redo, completeRedo, dispatch, getUndoableSnapshot]);

  const debugData = {
    queryDescription,
    queryResult,
    queryError,
    spec: spec,
    chartInfo,
    renderingError,
    optimizationHints,
    lastQueryDecision,
  };

  // Set up rendering tracking when spec changes
  // CRITICAL: Use useLayoutEffect instead of useEffect to ensure this runs
  // synchronously BEFORE child component effects (like ObservablePlot rendering).
  // This prevents race conditions where plots render before the batch is set up.
  useLayoutEffect(() => {
    if (useTableView) {
      // In table view, no chart rendering happens - cancel any pending rendering
      renderingCoordinator.cancelRenderingBatch();
      return;
    }

    if (spec && spec.plots && spec.plots.length > 0) {
      // Extract plot IDs from the spec
      const plotIds = spec.plots.map(plot => plot.id);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChartArea] Setting up rendering batch for', plotIds.length, 'plots');
      }
      
      // Start tracking this batch of plots
      // This runs BEFORE ObservablePlot effects, so the batch is ready
      // when plots start reporting completion
      renderingCoordinator.startRenderingBatch(plotIds, () => {
        // All plots have rendered, complete the rendering operation
        // Only complete if we're actually in a rendering state
        if (state.isLoadingRendering) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ChartArea] All plots rendered, completing rendering operation');
          }
          completeOperation('rendering');
        }
      });
    } else if (spec !== null && state.isLoadingRendering) {
      // If spec exists but has no plots, complete rendering immediately
      // (This handles the case where a valid spec generates no plots)
      // Only complete if we started a rendering operation
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChartArea] Spec has no plots, completing rendering immediately');
      }
      completeOperation('rendering');
    }
  }, [spec, useTableView, renderingCoordinator, completeOperation, state.isLoadingRendering]);

  // Create a callback for when individual plots render
  const handlePlotRenderComplete = useCallback((plotId: string) => {
    renderingCoordinator.markPlotRendered(plotId);
  }, [renderingCoordinator]);

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
          onPlotRenderComplete={handlePlotRenderComplete}
        />
        
        <ChartControls
          isDebugOpen={isDebugOpen}
          onToggleDebug={toggleDebugView}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isFullscreenSupported={isFullscreenSupported}
          onSwapAxis={handleSwapAxis}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onResetWorkspace={resetWorkspace}
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