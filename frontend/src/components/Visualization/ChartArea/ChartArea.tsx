import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import styles from './ChartArea.module.css';
import { useVisualizationContext, useChannels } from '../../../contexts/VisualizationContext';
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
  const channels = useChannels();

  // -- State destructuring -----------------------------------------------------
  const {
    xAxisFields,
    yAxisFields,
    queryResult,
    queryError,
    queryVersion,
    appliedFilterConfigurations,
    fieldOverrides,
    globalChartType,
    distributionVariant,
    measureValuesSourceFields,
    measureGroupFields,
    independentDomains,
    optimizationSettings,
    ganttZoomRange,
    showTableRows,
    overlays,
    disabledFilterIds,
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
    colorField: channels.color.field,
    sizeField: channels.size.field,
    labelFields: channels.label.fields,
    tooltipFields: channels.tooltip.fields,
    filterConfigurations: effectiveFilterConfigurations,
    virtualTable,
    virtualColumns,
  });

  const { queryDescription, optimizationHints, viewSpec, lastQueryDecision } = useQueryExecution({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    channels,
    filterConfigurations: effectiveFilterConfigurations,
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
      channels,
      useTableView,
      showTableRows,
      queryResult,
      queryVersion,
      startOperation,
      completeOperation,
      independentDomains,
      fieldOverrides,
      globalChartType,
      distributionVariant,
      measureValuesSourceFields,
      ganttZoomRange,
      overlays,
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
    sizeField: channels.size.field,
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
    bandThicknessScale: channels.size.bandThicknessScale,
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
  const colorColumnName = channels.color.field ? getResultColumnName(channels.color.field) : null;

  const clearSeriesHighlight = useCallback(() => {
    setHighlightedCategoryValues(null);
    clearLegendSelectionRef.current?.();
  }, []);

  // Reset highlight when the color field changes to avoid stale state
  useEffect(() => {
    clearSeriesHighlight();
  }, [channels.color.field, clearSeriesHighlight]);

  useSeriesHighlight(fullscreenWrapperRef, highlightedCategoryValues, colorColumnName, clearSeriesHighlight);

  // -- Sheet cache -------------------------------------------------------------
  const cacheConfig = useMemo(
    () => createChartAffectingConfig({
      xAxisFields,
      yAxisFields,
      appliedFilterConfigurations: effectiveFilterConfigurations,
      colorField: channels.color.field,
      sizeField: channels.size.field,
      shapeField: channels.shape.field,
      facetBackgroundField: channels.facetBackground.field,
      labelFields: channels.label.fields,
      tooltipFields: channels.tooltip.fields,
      measureGroupFields,
      colorScheme: channels.color.scheme,
      colorBias: channels.color.bias,
      manualColor: channels.color.manual,
      manualShape: channels.shape.manual,
      sizeRange: channels.size.range,
      manualSize: channels.size.manual,
      bandThicknessScale: channels.size.bandThicknessScale,
      fieldOverrides,
      globalChartType,
      distributionVariant,
      independentDomains,
      labelsEnabled: channels.label.enabled,
      labelSamplingStrategy: channels.label.samplingStrategy,
      labelSamplingThreshold: channels.label.samplingThreshold,
      labelSampleEvery: channels.label.sampleEvery,
    }),
    [
      xAxisFields, yAxisFields, effectiveFilterConfigurations, channels,
      measureGroupFields, fieldOverrides, globalChartType, distributionVariant, independentDomains,
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
    viewSpec,
    lastQueryDecision,
  };

  const showColorLegend = Boolean(channels.color.field && queryResult?.rows?.length);
  const showBackgroundLegend = Boolean(channels.facetBackground.field && queryResult?.rows?.length);
  const showShapeLegend = Boolean(channels.shape.field && queryResult?.rows?.length);
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
            bandThicknessScale={channels.size.bandThicknessScale}
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
                colorField={channels.color.field}
                queryResult={queryResult}
                colorScheme={channels.color.scheme}
                colorBias={channels.color.bias}
                onFilterAction={
                  channels.color.field?.flavour === 'discrete' ? handleLegendFilterAction : undefined
                }
                onHighlightChange={
                  channels.color.field?.flavour === 'discrete' ? setHighlightedCategoryValues : undefined
                }
                clearSelectionRef={clearLegendSelectionRef}
              />
            )}
            {showBackgroundLegend && (
              <BackgroundLegendPanel
                backgroundField={channels.facetBackground.field}
                queryResult={queryResult}
                colorScheme={channels.facetBackground.scheme}
                opacity={channels.facetBackground.opacity}
              />
            )}
            {showShapeLegend && (
              <ShapeLegendPanel
                shapeField={channels.shape.field}
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
