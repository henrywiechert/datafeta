import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import styles from './ChartArea.module.css';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useSheetContext } from '../../../contexts/SheetContext';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { useRenderingCoordinator } from '../../../hooks/useRenderingCoordinator';
import { useSheetCacheSave } from '../../../hooks/useSheetCacheCoordinator';
import {
  useChartGeneration,
  useQueryExecution,
  useDataProcessing,
  useDebugView,
  useFullscreen,
  useTableRowsQuery,
} from './hooks';
import { useAdditionalFields } from './hooks/useAdditionalFields';
import { useGanttZoom } from './hooks/useGanttZoom';
import { useFilterActions } from './hooks/useFilterActions';
import { useTableRowsFilterActions } from './hooks/useTableRowsFilterActions';
import { useChartActions } from './hooks/useChartActions';
import { useBrushZoom } from './hooks/useBrushZoom';
import { useRenderingTracking } from './hooks/useRenderingTracking';
import { useSeriesHighlight } from './hooks/useSeriesHighlight';
import { ChartRenderer, ChartControls, DebugPanel } from './components';
import LegendPanel from '../Legend/LegendPanel';
import BackgroundLegendPanel from '../Legend/BackgroundLegendPanel';
import ShapeLegendPanel from '../Legend/ShapeLegendPanel';
import LegendStack from '../Legend/LegendStack';
import FacetLimitDialog from '../FacetLimitDialog';
import { getResultColumnName } from '../../../utils/fieldUtils';
import { createChartAffectingConfig } from '../../../utils/queryAffectingConfig';

/**
 * ChartArea - thin orchestrator that delegates to specialised hooks.
 *
 * Responsibilities limited to:
 *  1. Reading context / state
 *  2. Wiring hooks together
 *  3. Composing the render tree
 */
const ChartArea: React.FC = () => {
  // -- Contexts ----------------------------------------------------------------
  const { state, dispatch, startOperation, completeOperation, getUndoableSnapshot } =
    useVisualizationContext();
  const { recordAction, undo, completeUndo, redo, completeRedo, canUndo, canRedo } = useUndoRedo();
  const { dataSource, clearSessionFilters } = useDataSource();
  const { resetWorkspace, activeSheet } = useSheetContext();
  const renderingCoordinator = useRenderingCoordinator();

  // -- State destructuring -----------------------------------------------------
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
    facetBackgroundField,
    facetBackgroundScheme,
    facetBackgroundOpacity,
    showTableRows,
    overlays,
    disabledFilterIds,
    shapeField,
  } = state;

  const { selectedTable, selectedDatabase, virtualTable, virtualColumns, sessionAppliedFilterConfigurations } =
    dataSource;

  // -- Derived values ----------------------------------------------------------
  const effectiveFilterConfigurations = useMemo(() => {
    const merged = { ...appliedFilterConfigurations, ...sessionAppliedFilterConfigurations };
    if (disabledFilterIds && disabledFilterIds.length > 0) {
      const result = { ...merged };
      disabledFilterIds.forEach(id => delete result[id]);
      return result;
    }
    return merged;
  }, [appliedFilterConfigurations, sessionAppliedFilterConfigurations, disabledFilterIds]);

  const fullscreenWrapperRef = useRef<HTMLDivElement>(null);
  const sheetId = activeSheet?.id;
  const isGanttChart = globalChartType === 'gantt';

  // -- Extracted hooks ---------------------------------------------------------
  const { additionalColorFields, additionalSizeFields, additionalLabelFields } =
    useAdditionalFields(fieldOverrides);

  const { useTableView, tableData } = useDataProcessing({ xAxisFields, yAxisFields, queryResult });

  // Table rows view: raw paginated data query
  const tableRowsData = useTableRowsQuery({
    enabled: showTableRows,
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    labelFields,
    tooltipFields,
    filterConfigurations: effectiveFilterConfigurations,
    virtualTable,
    virtualColumns,
  });

  const { queryDescription, optimizationHints, lastQueryDecision } = useQueryExecution({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    shapeField,
    facetBackgroundField,
    filterConfigurations: effectiveFilterConfigurations,
    labelFields,
    tooltipFields,
    virtualTable,
    virtualColumns,
    additionalColorFields,
    additionalSizeFields,
    additionalLabelFields,
    optimizationSettings,
  });

  const { spec, chartInfo, renderingError, facetLimitWarning, onFacetLimitProceed, onFacetLimitCancel } =
    useChartGeneration({
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
      showTableRows,
      queryResult,
      queryVersion,
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
      facetBackgroundField,
      facetBackgroundScheme,
      facetBackgroundOpacity,
      overlays,
      shapeField,
    });

  const { handleLegendFilterAction, handleShapeLegendFilterAction, specWithTooltipAction } = useFilterActions({
    recordAction,
    getUndoableSnapshot,
    spec,
  });

  const { handleTableCellFilterAction } = useTableRowsFilterActions({
    recordAction,
    getUndoableSnapshot,
  });

  const { ganttFullDataRange, handleGanttZoomRangeChange } = useGanttZoom({
    isGanttChart,
    queryResult,
    xAxisFields,
    sizeField,
    dispatch,
  });

  const {
    handleResetWorkspace,
    handleSwapAxis,
    handleUndo,
    handleRedo,
    handleIndependentXAxisToggle,
    handleIndependentYAxisToggle,
    handleForceRefresh,
  } = useChartActions({
    dispatch,
    recordAction,
    getUndoableSnapshot,
    undo,
    completeUndo,
    redo,
    completeRedo,
    resetWorkspace,
    clearSessionFilters,
    bandThicknessScale,
    selectedTable,
    selectedDatabase,
  });

  const { brushDisabled, handleBrushEnd, handleZoomOut, handleZoomReset, hasActiveZoomFilters } = useBrushZoom({
    dispatch,
    filterFields: state.filterFields,
    appliedFilterConfigurations,
    filterMetadata: state.filterMetadata,
    recordAction,
    getUndoableSnapshot,
    independentDomains,
  });

  const { handlePlotRenderComplete } = useRenderingTracking({
    spec,
    useTableView,
    showTableRows,
    renderingCoordinator,
    completeOperation,
    isLoadingRendering: state.isLoadingRendering,
  });

  const { isDebugOpen, debugHeight, maxDebugHeight, toggleDebugView, handleDebugResize } = useDebugView();
  const { isFullscreen, toggleFullscreen, isSupported: isFullscreenSupported } = useFullscreen(fullscreenWrapperRef);

  // -- Series highlight (legend click → dim non-matching marks) ----------------
  const [highlightedCategoryValues, setHighlightedCategoryValues] = useState<any[] | null>(null);
  const clearLegendSelectionRef = useRef<(() => void) | null>(null);
  const colorColumnName = colorField ? getResultColumnName(colorField) : null;

  const clearSeriesHighlight = useCallback(() => {
    setHighlightedCategoryValues(null);
    clearLegendSelectionRef.current?.();
  }, []);

  // Reset highlight when the color field changes to avoid stale state
  useEffect(() => {
    clearSeriesHighlight();
  }, [colorField, clearSeriesHighlight]);

  useSeriesHighlight(fullscreenWrapperRef, highlightedCategoryValues, colorColumnName, clearSeriesHighlight);

  // -- Sheet cache -------------------------------------------------------------
  const cacheConfig = useMemo(
    () => createChartAffectingConfig({
      xAxisFields,
      yAxisFields,
      appliedFilterConfigurations: effectiveFilterConfigurations,
      colorField,
      sizeField,
      shapeField,
      facetBackgroundField,
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
    }),
    [
      xAxisFields, yAxisFields, effectiveFilterConfigurations, colorField, sizeField, shapeField,
      facetBackgroundField, labelFields, tooltipFields, measureGroupFields, colorScheme, colorBias, manualColor,
      sizeRange, manualSize, bandThicknessScale, fieldOverrides, globalChartType,
      independentDomains, labelsEnabled, labelSamplingStrategy, labelSamplingThreshold,
      labelSampleEvery,
    ],
  );

  const specRef = useRef(specWithTooltipAction);
  specRef.current = specWithTooltipAction;

  useSheetCacheSave(
    sheetId,
    useCallback(() => ({ queryResult, chartSpec: specRef.current, config: cacheConfig }), [queryResult, cacheConfig]),
  );

  // -- Debug / legend flags ----------------------------------------------------
  const debugData = {
    queryDescription,
    queryResult,
    queryError,
    spec,
    chartInfo,
    renderingError,
    optimizationHints,
    lastQueryDecision,
  };

  const showColorLegend = Boolean(colorField && queryResult?.rows?.length);
  const showBackgroundLegend = Boolean(facetBackgroundField && queryResult?.rows?.length);
  const showShapeLegend = Boolean(shapeField && queryResult?.rows?.length);
  const showLegend = showColorLegend || showBackgroundLegend || showShapeLegend;

  // -- Render ------------------------------------------------------------------
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
            spec={specWithTooltipAction}
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
            brushDisabled={brushDisabled}
            onBrushEnd={handleBrushEnd}
            showTableRows={showTableRows}
            tableRowsData={showTableRows ? tableRowsData : undefined}
            onTableCellFilterAction={handleTableCellFilterAction}
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
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
            hasActiveZoomFilters={hasActiveZoomFilters}
            showTableRows={showTableRows}
            onToggleTableRows={(show) => {
              recordAction(getUndoableSnapshot());
              dispatch({ type: 'SET_SHOW_TABLE_ROWS', payload: show });
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
            {showColorLegend && (
              <LegendPanel
                colorField={colorField}
                queryResult={queryResult}
                colorScheme={colorScheme}
                colorBias={colorBias}
                onFilterAction={
                  colorField?.flavour === 'discrete' ? handleLegendFilterAction : undefined
                }
                onHighlightChange={
                  colorField?.flavour === 'discrete' ? setHighlightedCategoryValues : undefined
                }
                clearSelectionRef={clearLegendSelectionRef}
              />
            )}
            {showBackgroundLegend && (
              <BackgroundLegendPanel
                backgroundField={facetBackgroundField}
                queryResult={queryResult}
                colorScheme={facetBackgroundScheme}
                opacity={facetBackgroundOpacity}
              />
            )}
            {showShapeLegend && (
              <ShapeLegendPanel
                shapeField={shapeField}
                queryResult={queryResult}
                onFilterAction={handleShapeLegendFilterAction}
              />
            )}
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
