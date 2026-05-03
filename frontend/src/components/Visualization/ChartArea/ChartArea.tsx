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
import { useTablePageSize } from '../../../hooks/useTablePageSize';
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
import { filtersToHashKey } from '../../../utils/sheetConfigHash';
import { buildEffectiveFilterConfigurations } from '../../../utils/effectiveFilters';
import { isTablePresentation } from '../../../observable-plot-generator/chartTypes/chartTypePresentation';

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
    tableCellMode,
    tablePage,
    measureValuesSourceFields,
    measureGroupFields,
    independentDomains,
    optimizationSettings,
    ganttZoomRange,
    showTableRows,
    overlays,
    disabledFilterIds,
    categoryTickStyles,
  } = state;

  const { selectedTable, selectedDatabase, virtualTable, virtualColumns, sessionAppliedFilterConfigurations } =
    dataSource;

  const [autoCategoryTickStyles, setAutoCategoryTickStyles] = useState({
    xHeightPx: null as number | null,
    yWidthPx: null as number | null,
  });

  // -- Derived values ----------------------------------------------------------
  const effectiveFilterConfigurations = useMemo(
    () => buildEffectiveFilterConfigurations({
      localConfigurations: appliedFilterConfigurations,
      sessionConfigurations: sessionAppliedFilterConfigurations,
      disabledFilterIds,
    }),
    [appliedFilterConfigurations, sessionAppliedFilterConfigurations, disabledFilterIds]
  );

  const stableEffectiveFilterConfigurationsRef = useRef(effectiveFilterConfigurations);
  const stableEffectiveFilterHashRef = useRef(filtersToHashKey(effectiveFilterConfigurations));
  const effectiveFilterHash = useMemo(
    () => filtersToHashKey(effectiveFilterConfigurations),
    [effectiveFilterConfigurations],
  );

  if (stableEffectiveFilterHashRef.current !== effectiveFilterHash) {
    stableEffectiveFilterHashRef.current = effectiveFilterHash;
    stableEffectiveFilterConfigurationsRef.current = effectiveFilterConfigurations;
  }

  const chartFilterConfigurations = stableEffectiveFilterConfigurationsRef.current;

  const fullscreenWrapperRef = useRef<HTMLDivElement>(null);
  const sheetId = activeSheet?.id;
  const isGanttChart = globalChartType === 'gantt';
  // Whether the chart is rendered with the table presentation (Tableau-style
  // text/symbol grid). Today only `'table-refactor'` uses this; routing the
  // check through the registry means future table-presentation chart types
  // pick up the pager/cache-key behaviour automatically.
  const isTableMode = isTablePresentation(globalChartType);

  // Global user setting: rows per page for the table-presentation pager.
  // Persisted in localStorage so the choice survives reloads / sheet switches.
  const { pageSize: tablePageSize, setPageSize: setTablePageSize } = useTablePageSize();

  // -- Extracted hooks ---------------------------------------------------------
  const { additionalColorFields, additionalSizeFields, additionalLabelFields } =
    useAdditionalFields(fieldOverrides);

  const { useTableView, tableData } = useDataProcessing({ xAxisFields, yAxisFields, queryResult, globalChartType });

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
    filterConfigurations: chartFilterConfigurations,
    virtualTable,
    virtualColumns,
  });

  const { queryDescription, optimizationHints, viewSpec, lastQueryDecision } = useQueryExecution({
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    channels,
    filterConfigurations: chartFilterConfigurations,
    virtualTable,
    virtualColumns,
    additionalColorFields,
    additionalSizeFields,
    additionalLabelFields,
    optimizationSettings,
  });

  useEffect(() => {
    setAutoCategoryTickStyles({ xHeightPx: null, yWidthPx: null });
  }, [queryVersion, xAxisFields, yAxisFields, globalChartType, distributionVariant]);

  const handleAutoCategoryTickMeasure = useCallback((sizes: { xHeightPx: number; yWidthPx: number }) => {
    setAutoCategoryTickStyles((prev) => {
      if (prev.xHeightPx === sizes.xHeightPx && prev.yWidthPx === sizes.yWidthPx) {
        return prev;
      }
      return sizes;
    });
  }, []);

  const { grid, chartInfo, renderingError, facetLimitWarning, onFacetLimitProceed, onFacetLimitCancel } =
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
      tableCellMode,
      tablePage,
      tablePageSize: isTableMode ? tablePageSize : undefined,
      measureValuesSourceFields,
      ganttZoomRange,
      overlays,
      viewSpec,
      xAxisTickHeightPx: categoryTickStyles.xHeightPx ?? autoCategoryTickStyles.xHeightPx,
      yAxisTickWidthPx: categoryTickStyles.yWidthPx ?? autoCategoryTickStyles.yWidthPx,
    });

  const { handleLegendFilterAction, handleShapeLegendFilterAction, gridWithTooltipAction } = useFilterActions({
    recordAction,
    getUndoableSnapshot,
    grid,
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
    grid,
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

  // -- Table-refactor pager wiring --------------------------------------------
  // Reset the per-sheet page index to 0 whenever the underlying row-tuple set
  // is invalidated (axis/filter/dim changes). Cheap and avoids stale page
  // indices that point past the new totalRowTuples.
  useEffect(() => {
    if (!isTableMode) return;
    if (state.tablePage === 0) return;
    dispatch({ type: 'SET_TABLE_PAGE', payload: 0 });
    // We intentionally only react to inputs that change the row-tuple set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isTableMode,
    xAxisFields,
    yAxisFields,
    effectiveFilterConfigurations,
    chartFilterConfigurations,
    selectedTable,
    selectedDatabase,
    virtualTable,
    virtualColumns,
    tablePageSize,
    dispatch,
  ]);

  const handleTablePageChange = useCallback(
    (page: number) => {
      dispatch({ type: 'SET_TABLE_PAGE', payload: page });
    },
    [dispatch],
  );

  const handleTablePageSizeChange = useCallback(
    (size: number) => {
      setTablePageSize(size);
      dispatch({ type: 'SET_TABLE_PAGE', payload: 0 });
    },
    [setTablePageSize, dispatch],
  );

  const tableRefactorPagerData = useMemo(() => {
    if (!isTableMode) return undefined;
    const pagination = grid?.pagination;
    return {
      page: pagination?.page ?? tablePage ?? 0,
      pageSize: pagination?.pageSize ?? tablePageSize,
      totalRowTuples: pagination?.totalRowTuples ?? 0,
      onPageChange: handleTablePageChange,
      onPageSizeChange: handleTablePageSizeChange,
      loading: state.isLoadingQuery || state.isLoadingRendering,
    };
  }, [
    isTableMode,
    grid,
    tablePage,
    tablePageSize,
    handleTablePageChange,
    handleTablePageSizeChange,
    state.isLoadingQuery,
    state.isLoadingRendering,
  ]);

  // -- Sheet cache -------------------------------------------------------------
  const cacheConfig = useMemo(
    () => createChartAffectingConfig({
      xAxisFields,
      yAxisFields,
      appliedFilterConfigurations: chartFilterConfigurations,
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
      tableCellMode,
      tablePage: isTableMode ? tablePage : undefined,
      tablePageSize: isTableMode ? tablePageSize : undefined,
      independentDomains,
      labelsEnabled: channels.label.enabled,
      labelSamplingStrategy: channels.label.samplingStrategy,
      labelSamplingThreshold: channels.label.samplingThreshold,
      labelSampleEvery: channels.label.sampleEvery,
    }),
    [
      xAxisFields, yAxisFields, chartFilterConfigurations, channels,
      measureGroupFields, fieldOverrides, globalChartType, distributionVariant, tableCellMode,
      isTableMode, tablePage, tablePageSize,
      independentDomains,
    ],
  );

  const gridRef = useRef(gridWithTooltipAction);
  gridRef.current = gridWithTooltipAction;

  useSheetCacheSave(
    sheetId,
    useCallback(() => ({ queryResult, chartGrid: gridRef.current, config: cacheConfig }), [queryResult, cacheConfig]),
  );

  // -- Debug / legend flags ----------------------------------------------------
  const debugData = {
    queryDescription,
    queryResult,
    queryError,
    grid,
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
            grid={gridWithTooltipAction}
            onAutoCategoryTickMeasure={handleAutoCategoryTickMeasure}
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
            tableRefactorPagerData={tableRefactorPagerData}
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
