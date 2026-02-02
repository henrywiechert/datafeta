import React, { useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import styles from './ChartArea.module.css';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useSheetContext } from '../../../contexts/SheetContext';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { useRenderingCoordinator } from '../../../hooks/useRenderingCoordinator';
import { useSheetCacheSave } from '../../../hooks/useSheetCacheCoordinator';
import { columnCacheManager } from '../../../services/columnCacheManager';
import { filterTierManager } from '../../../services/filterTierManager';
import { useChartGeneration, useQueryExecution, useDataProcessing, useDebugView, useFullscreen } from './hooks';
import { ChartRenderer, ChartControls, DebugPanel } from './components';
import LegendPanel from '../Legend/LegendPanel';
import LegendStack from '../Legend/LegendStack';
import FacetLimitDialog from '../FacetLimitDialog';

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
    bandThicknessScale,
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
    fieldOverrides,
    globalChartType,
    measureValuesSourceFields,
    measureGroupFields,
    independentDomains,
    optimizationSettings,
    ganttZoomRange,
  } = state as any;
  const { selectedTable, selectedDatabase, virtualTable, virtualColumns, sessionAppliedFilterConfigurations } = dataSource;
  
  // Merge session (global) and local applied filter configurations for query execution
  // Session filters take precedence as they represent the "global" state
  const effectiveFilterConfigurations = useMemo(() => ({
    ...appliedFilterConfigurations,
    ...sessionAppliedFilterConfigurations,
  }), [appliedFilterConfigurations, sessionAppliedFilterConfigurations]);
  
  // Ref for the fullscreen target element
  const fullscreenWrapperRef = useRef<HTMLDivElement>(null);

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

  // Get active sheet ID for cache coordination
  const { activeSheet } = useSheetContext();
  const sheetId = activeSheet?.id;

  // Determine if current chart is a Gantt chart
  const isGanttChart = globalChartType === 'gantt';

  // Compute full data range for Gantt chart zoom calculations
  // This extracts min/max from the start field (first continuous dimension on X for horizontal Gantt)
  const ganttFullDataRange = useMemo(() => {
    if (!isGanttChart || !queryResult?.rows?.length) {
      return null;
    }
    
    // Find the start field - for horizontal Gantt, it's a continuous dimension on X axis
    const startField = xAxisFields.find((f: any) => 
      f.type === 'dimension' && f.flavour === 'continuous'
    );
    
    if (!startField) {
      return null;
    }
    
    // Get the column name (handle aliasing)
    const columnName = startField.columnName || startField.name;
    
    // Compute min/max from data
    let min = Infinity;
    let max = -Infinity;
    
    // Also consider duration (size field) for computing max extent
    const durationField = sizeField;
    const durationColumn = durationField?.columnName || durationField?.name;
    
    for (const row of queryResult.rows) {
      const startValue = row[columnName];
      if (typeof startValue === 'number' && Number.isFinite(startValue)) {
        if (startValue < min) min = startValue;
        
        // Compute end value (start + duration) for max
        const duration = durationColumn ? row[durationColumn] : 0;
        const endValue = typeof duration === 'number' && Number.isFinite(duration) && duration > 0
          ? startValue + duration
          : startValue;
        
        if (endValue > max) max = endValue;
        if (startValue > max) max = startValue;
      }
    }
    
    if (min === Infinity || max === -Infinity) {
      return null;
    }
    
    // Add small padding (5%)
    const range = max - min;
    const padding = range * 0.05;
    
    return { min: min - padding, max: max + padding };
  }, [isGanttChart, queryResult, xAxisFields, sizeField]);

  // Handler for Gantt zoom range changes
  const handleGanttZoomRangeChange = useCallback((range: { min: number; max: number } | null) => {
    dispatch({ type: 'SET_GANTT_ZOOM_RANGE', payload: range });
  }, [dispatch]);

  // Memoize cache config to avoid unnecessary recomputation
  const cacheConfig = useMemo(() => ({
    xAxisFields,
    yAxisFields,
    appliedFilterConfigurations: effectiveFilterConfigurations,
    colorField,
    sizeField,
    labelFields,
    tooltipFields,
    measureGroupFields,
    colorScheme,
    colorBias,
    manualColor,
    sizeRange,
    manualSize,
    bandThicknessScale,
    fieldOverrides,
    globalChartType,
    independentDomains,
    labelsEnabled,
    labelSamplingStrategy,
    labelSamplingThreshold,
    labelSampleEvery,
  }), [
    xAxisFields, yAxisFields, effectiveFilterConfigurations, colorField, sizeField,
    labelFields, tooltipFields, measureGroupFields, colorScheme, colorBias, manualColor, sizeRange,
    manualSize, bandThicknessScale, fieldOverrides, globalChartType, independentDomains,
    labelsEnabled, labelSamplingStrategy, labelSamplingThreshold, labelSampleEvery,
  ]);

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
    filterConfigurations: effectiveFilterConfigurations,
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
    optimizationSettings,
  });

  // Use the extracted chart generation hook
  const { 
    spec, 
    chartInfo, 
    renderingError,
    facetLimitWarning,
    onFacetLimitProceed,
    onFacetLimitCancel,
  } = useChartGeneration({
    xAxisFields,
    yAxisFields,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    sizeField,
    sizeRange,
    manualSize,
    bandThicknessScale,
    useTableView,
    queryResult, // Pass queryResult here
    queryVersion, // Pass queryVersion to detect UNION/JOIN changes
    startOperation,
    completeOperation,
    independentDomains,
    labelFields,
    labelsEnabled,
    labelSamplingStrategy,
    labelSamplingThreshold,
    labelSampleEvery,
    tooltipFields,
    fieldOverrides,
    globalChartType,
    measureValuesSourceFields,
    ganttZoomRange,
  });

  // Save to sheet render cache on unmount (sheet switch)
  // This captures the current queryResult and chartSpec for instant restore
  const specRef = useRef(spec);
  specRef.current = spec;
  
  useSheetCacheSave(sheetId, useCallback(() => ({
    queryResult,
    chartSpec: specRef.current,
    config: cacheConfig,
  }), [queryResult, cacheConfig]));

  // Use the extracted debug view hook
  const { isDebugOpen, debugHeight, maxDebugHeight, toggleDebugView, handleDebugResize } = useDebugView();
  
  // Use the fullscreen hook
  const { isFullscreen, toggleFullscreen, isSupported: isFullscreenSupported } = useFullscreen(fullscreenWrapperRef);

  const handleResetWorkspace = useCallback(() => {
    // Clear measure group via VisualizationContext (per-sheet)
    dispatch({ type: 'CLEAR_MEASURE_GROUP' });
    resetWorkspace();
  }, [dispatch, resetWorkspace]);

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
          fieldOverrides: previousState.fieldOverrides || {},
          bandThicknessScale: previousState.bandThicknessScale ?? state.bandThicknessScale,
        }
      });
      
      // Complete the undo operation
      completeUndo(currentState);
    }
  }, [undo, completeUndo, dispatch, getUndoableSnapshot, state.bandThicknessScale]);

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
          fieldOverrides: nextState.fieldOverrides || {},
          bandThicknessScale: nextState.bandThicknessScale ?? state.bandThicknessScale,
        }
      });
      
      // Complete the redo operation
      completeRedo(currentState);
    }
  }, [redo, completeRedo, dispatch, getUndoableSnapshot, state.bandThicknessScale]);

  const handleIndependentXAxisToggle = useCallback((independent: boolean) => {
    recordAction(getUndoableSnapshot());
    dispatch({ type: 'SET_INDEPENDENT_DOMAIN', payload: { axis: 'x', independent } });
  }, [dispatch, getUndoableSnapshot, recordAction]);

  const handleIndependentYAxisToggle = useCallback((independent: boolean) => {
    recordAction(getUndoableSnapshot());
    dispatch({ type: 'SET_INDEPENDENT_DOMAIN', payload: { axis: 'y', independent } });
  }, [dispatch, getUndoableSnapshot, recordAction]);

  const handleForceRefresh = useCallback(async () => {
    if (!selectedTable) {
      return;
    }
    await columnCacheManager.invalidateForTable(selectedTable, selectedDatabase || undefined);
    filterTierManager.resetBaseFilterState(selectedTable, selectedDatabase || undefined);
    dispatch({ type: 'FORCE_QUERY_REFRESH' });
  }, [dispatch, selectedDatabase, selectedTable]);

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

  const showLegend = Boolean(colorField && queryResult?.rows?.length);

  return (
    <div className={styles.container}>
      <div
        ref={fullscreenWrapperRef}
        className={`${styles.fullscreenWrapper} ${isFullscreen ? styles.fullscreen : ''}`}
      >
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
            onPlotRenderComplete={handlePlotRenderComplete}
            isGanttChart={isGanttChart}
            ganttZoomRange={ganttZoomRange}
            onGanttZoomRangeChange={handleGanttZoomRangeChange}
            ganttFullDataRange={ganttFullDataRange}
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
            onResetWorkspace={handleResetWorkspace}
            independentXAxis={!!independentDomains?.x}
            onToggleIndependentXAxis={handleIndependentXAxisToggle}
            independentYAxis={!!independentDomains?.y}
            onToggleIndependentYAxis={handleIndependentYAxisToggle}
            optimizationSettings={optimizationSettings}
            onUpdateOptimizationSettings={(settings) => {
              dispatch({ type: 'SET_QUERY_OPTIMIZATION_SETTINGS', payload: settings });
              dispatch({ type: 'FORCE_QUERY_REFRESH' });
            }}
            onForceRefresh={handleForceRefresh}
            bandThicknessScale={bandThicknessScale}
            onBandThicknessScaleChange={(scale) => {
              recordAction(getUndoableSnapshot());
              dispatch({ type: 'SET_BAND_THICKNESS_SCALE', payload: scale });
            }}
          />
          
          <DebugPanel
            isDebugOpen={isDebugOpen}
            debugHeight={debugHeight}
            maxDebugHeight={maxDebugHeight}
            onDebugResize={handleDebugResize}
            debugData={debugData}
          />
        </div>
        {showLegend && (
          <LegendStack>
            <LegendPanel
              colorField={colorField}
              queryResult={queryResult}
              colorScheme={colorScheme}
              colorBias={colorBias}
            />
          </LegendStack>
        )}
      </div>

      {/* Facet Limit Warning Dialog */}
      <FacetLimitDialog
        open={facetLimitWarning !== null}
        validationResult={facetLimitWarning}
        onProceed={onFacetLimitProceed}
        onCancel={onFacetLimitCancel}
      />
    </div>
  );
};

export default ChartArea; 