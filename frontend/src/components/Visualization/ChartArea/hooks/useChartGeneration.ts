// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useState, useEffect, useRef } from 'react';
import { generatePlot } from '../../../../observable-plot-generator/observablePlotGenerator';
import { ChartGenerationContext, GanttZoomRange } from '../../../../observable-plot-generator/types';
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import { OverlayConfig } from '../../../../observable-plot-generator/overlays/types';
import { Field, FieldOverrideState, UserChartType, Channels, DistributionVariant, TableCellMode, LineVariant, DensityParams } from '../../../../types';
import { computeOverrideTargets } from '../../../../observable-plot-generator/utils/fieldOverrides';
import { detectDefaultUserChartType } from '../../../../observable-plot-generator/helpers/chartTypeResolver';
import { logOperationTiming } from '../utils';
import { planFacets } from '../../../../observable-plot-generator/faceting/facetPlanner';
import { validateFacetCounts, FacetValidationResult } from '../../../../observable-plot-generator/faceting/facetValidation';
import { useFieldAliasLookup } from '../../../../hooks/useFieldDisplayName';
import { ViewSpec } from '../../../../viewPlanner';
import { devLog } from '../../../../utils/devLog';

/** Debounce delay for zoom-triggered regeneration (ms) */
const ZOOM_REGEN_DEBOUNCE_MS = 150;

interface UseChartGenerationProps {
  xAxisFields: any[];
  yAxisFields: any[];
  channels: Channels;
  useTableView: boolean;
  showTableRows?: boolean;
  queryResult: any; // Add queryResult here
  queryVersion?: number; // Add queryVersion to detect union/join changes
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: (operationType: 'query' | 'rendering' | 'metadata') => void;
  fieldOverrides?: Record<string, FieldOverrideState>;
  globalChartType?: UserChartType | null;
  lineVariant?: LineVariant;
  areaFillOpacity?: number;
  distributionVariant?: DistributionVariant;
  tableCellMode?: TableCellMode;
  /** 0-based page index for the 'table-refactor' chart type pager. */
  tablePage?: number;
  /** Rows-per-page (global user setting) for the 'table-refactor' chart type. */
  tablePageSize?: number;
  measureValuesSourceFields?: Field[];
  independentDomains?: { x?: boolean; y?: boolean };
  ganttZoomRange?: GanttZoomRange | null;
  overlays?: OverlayConfig[];
  densityParams?: DensityParams;
  viewSpec?: ViewSpec | null;
  xAxisTickHeightPx?: number | null;
  yAxisTickWidthPx?: number | null;
}

interface UseChartGenerationReturn {
  grid: GridResultModel | null;
  chartInfo: any | null;
  renderingError: string | null;
  generateChartSpec: () => Promise<void>;
  cancelGeneration: () => void;
  /** Warning state when facet count exceeds limit */
  facetLimitWarning: FacetValidationResult | null;
  /** Called when user chooses to proceed despite facet limit warning */
  onFacetLimitProceed: () => void;
  /** Called when user cancels (does not proceed with rendering) */
  onFacetLimitCancel: () => void;
}

export const useChartGeneration = ({
  xAxisFields,
  yAxisFields,
  channels,
  useTableView,
  showTableRows = false,
  queryResult, // Destructure here
  queryVersion, // Destructure queryVersion
  startOperation,
  completeOperation,
  fieldOverrides = {},
  globalChartType,
  lineVariant = 'line',
  areaFillOpacity,
  distributionVariant = 'tick-strip',
  tableCellMode = 'auto',
  tablePage,
  tablePageSize,
  measureValuesSourceFields = [],
  independentDomains,
  ganttZoomRange,
  overlays,
  densityParams,
  viewSpec,
  xAxisTickHeightPx,
  yAxisTickWidthPx,
}: UseChartGenerationProps): UseChartGenerationReturn => {
  const { field: colorField, scheme: colorScheme = 'tableau10', bias: colorBias = 0, manual: manualColor } = channels.color;
  const { field: sizeField, range: sizeRange, manual: manualSize, bandThicknessScale } = channels.size;
  const { field: shapeField, manual: manualShape } = channels.shape;
  const { fields: labelFields, enabled: labelsEnabled, samplingStrategy: labelSamplingStrategy, samplingThreshold: labelSamplingThreshold, sampleEvery: labelSampleEvery, fontSize: labelFontSize } = channels.label;
  const { fields: tooltipFields } = channels.tooltip;
  const { field: facetBackgroundField, scheme: facetBackgroundScheme, opacity: facetBackgroundOpacity } = channels.facetBackground;

  const [grid, setGrid] = useState<GridResultModel | null>(null);
  const [chartInfo, setChartInfo] = useState<any | null>(null);
  const [renderingError, setRenderingError] = useState<string | null>(null);
  const [facetLimitWarning, setFacetLimitWarning] = useState<FacetValidationResult | null>(null);
  
  // Get field alias lookup for chart labels
  const fieldAliasLookup = useFieldAliasLookup();
  
  // Store pending generation context for when user proceeds after warning
  const pendingGenerationRef = useRef<{
    context: ChartGenerationContext;
    overrideTargets: any;
    startTime: number;
  } | null>(null);

  // Use ref for ganttZoomRange to avoid triggering full spec regeneration on every zoom change
  // This is a performance optimization: zoom changes are frequent during keyboard navigation
  const ganttZoomRangeRef = useRef(ganttZoomRange);
  const zoomRegenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Track the last zoom range that was used in spec generation
  const lastGeneratedZoomRef = useRef<GanttZoomRange | null | undefined>(undefined);

  /**
   * Core chart generation logic, extracted to be called both initially and after user proceeds.
   */
  const doGenerateChart = useCallback(async (
    context: ChartGenerationContext,
    overrideTargets: any,
    startTime: number
  ) => {
    const generatedGrid = generatePlot(context);

    const cellCount = generatedGrid.cells?.length || 0;
    if (process.env.NODE_ENV === 'development') {
      devLog('[useChartGeneration] Generated grid with', cellCount, 'cells');
    }

    // For large numbers of cells, the synchronous DOM rendering will block
    // the main thread for seconds. Yield to the event loop BEFORE setting
    // the grid to give the modal a chance to appear.
    if (cellCount > 100) {
      if (process.env.NODE_ENV === 'development') {
        devLog('[useChartGeneration] Large cell count detected, yielding to show modal');
      }
      // Yield to event loop to let modal appear
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    setGrid(generatedGrid);
    setChartInfo({ chartType: 'observable-plot' });
    setRenderingError(null);

    logOperationTiming('Chart spec generation', startTime, { mode: 'observable-plot' });
  }, []);

  /**
   * Called when user chooses to proceed despite facet limit warning.
   */
  const onFacetLimitProceed = useCallback(async () => {
    const pending = pendingGenerationRef.current;
    if (!pending) {
      setFacetLimitWarning(null);
      return;
    }

    setFacetLimitWarning(null);
    
    try {
      if (process.env.NODE_ENV === 'development') {
        devLog('[useChartGeneration] User proceeded despite facet limit warning');
      }
      startOperation('rendering', true);
      
      // Yield to let UI update
      await new Promise(resolve => setTimeout(resolve, 0));
      
      await doGenerateChart(pending.context, pending.overrideTargets, pending.startTime);
    } catch (error: any) {
      console.error('Observable Plot generation failed:', error);
      setRenderingError(`Chart generation failed: ${error.message || 'Unknown error'}`);
      setGrid(null);
      setChartInfo(null);
      completeOperation('rendering');
    } finally {
      pendingGenerationRef.current = null;
    }
  }, [doGenerateChart, startOperation, completeOperation]);

  /**
   * Called when user cancels after seeing the facet limit warning.
   */
  const onFacetLimitCancel = useCallback(() => {
    setFacetLimitWarning(null);
    pendingGenerationRef.current = null;
    // Don't generate a chart, leave the current state
    // The user chose not to proceed
  }, []);

  const generateChartSpec = useCallback(async () => {
    void queryVersion; // Ensure chart regeneration tracks query version changes.
    const startTime = Date.now();
    
    if ((xAxisFields.length === 0 && yAxisFields.length === 0) || useTableView || showTableRows) {
      setGrid(null);
      setChartInfo(null);
      setRenderingError(null);
      setFacetLimitWarning(null);
      return;
    }

    // Don't generate chart if we have fields but no query result yet
    if (!queryResult) {
      return;
    }

    try {
      setRenderingError(null);

      const overrideTargets = computeOverrideTargets(
        xAxisFields as Field[],
        yAxisFields as Field[],
        measureValuesSourceFields
      );

      // Auto-route to a default chart type when the user has not picked one
      // explicitly. Today this only fires for heatmap (1 discrete X dim + 1
      // discrete Y dim + measure on color); other shapes fall through to the
      // existing per-pair detection in `coreGridGenerator`.
      const effectiveGlobalChartType =
        globalChartType ?? detectDefaultUserChartType(
          xAxisFields as Field[],
          yAxisFields as Field[],
          colorField || undefined
        ) ?? null;

      // Build the chart generation context
      // NOTE: Use ref for ganttZoomRange to avoid frequent regeneration during zoom
      const context: ChartGenerationContext = {
        xFields: xAxisFields,
        yFields: yAxisFields,
        colorField: colorField || undefined,
        colorScheme,
        colorBias,
        manualColor,
        sizeField: sizeField || undefined,
        sizeRange,
        manualSize,
        bandThicknessScale,
        queryResult,
        labelFields,
        labelsEnabled,
        labelSamplingStrategy,
        labelSamplingThreshold,
        labelSampleEvery,
        labelFontSize,
        tooltipFields,
        fieldOverrides,
        fieldOverrideTargets: overrideTargets,
        globalChartType: effectiveGlobalChartType,
        lineVariant,
        areaFillOpacity,
        distributionVariant,
        tableCellMode,
        tablePage,
        tablePageSize,
        measureValuesSourceFields,
        independentDomains,
        ganttZoomRange: ganttZoomRangeRef.current,
        fieldAliasLookup,
        // Facet background encoding
        facetBackgroundField: facetBackgroundField || undefined,
        facetBackgroundScheme,
        facetBackgroundOpacity,
        overlays,
        densityParams,
        viewSpec,
        xAxisTickHeightPx,
        yAxisTickWidthPx,
        // Shape encoding
        shapeField: shapeField || undefined,
        manualShape,
      };
      
      // Track which zoom range we generated with
      lastGeneratedZoomRef.current = ganttZoomRangeRef.current;

      // Check if faceting would be applied and validate facet counts
      // Heatmap mode handles large grids natively — skip the warning.
      const facetPlan = planFacets(context);
      if (
        effectiveGlobalChartType !== 'heatmap' &&
        facetPlan && (facetPlan.rowFacetFields.length > 0 || facetPlan.colFacetFields.length > 0)
      ) {
        const validation = validateFacetCounts(context, facetPlan);
        
        if (!validation.isValid) {
          // Store context for potential proceed
          pendingGenerationRef.current = { context, overrideTargets, startTime };
          setFacetLimitWarning(validation);
          
          if (process.env.NODE_ENV === 'development') {
            devLog('[useChartGeneration] Facet limit exceeded:', validation);
          }
          // Don't proceed - wait for user decision
          return;
        }
      }

      // Clear any previous warning
      setFacetLimitWarning(null);

      if (process.env.NODE_ENV === 'development') {
        devLog('[useChartGeneration] Starting rendering operation');
      }
      startOperation('rendering', true);

      // CRITICAL: Yield to event loop BEFORE starting heavy synchronous work
      // This allows the modal timeout to fire and display the modal
      await new Promise(resolve => setTimeout(resolve, 0));

      await doGenerateChart(context, overrideTargets, startTime);
      
      // NOTE: We don't complete the rendering operation here anymore.
      // The actual DOM rendering happens later, and ChartArea will coordinate
      // completion after all plots have rendered.
      
    } catch (error: any) {
      console.error('Observable Plot generation failed:', error);
      setRenderingError(`Chart generation failed: ${error.message || 'Unknown error'}`);
      setGrid(null);
      setChartInfo(null);
      // On error, complete the operation immediately since no rendering will happen
      completeOperation('rendering');
    }
  }, [
    xAxisFields,
    yAxisFields,
    useTableView,
    showTableRows,
    startOperation,
    completeOperation,
    queryResult,
    queryVersion,
    fieldOverrides,
    globalChartType,
    lineVariant,
    areaFillOpacity,
    distributionVariant,
    tableCellMode,
    tablePage,
    tablePageSize,
    measureValuesSourceFields,
    independentDomains,
    doGenerateChart,
    fieldAliasLookup,
    overlays,
    densityParams,
    viewSpec,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    sizeField,
    sizeRange,
    manualSize,
    bandThicknessScale,
    shapeField,
    manualShape,
    labelFields,
    labelsEnabled,
    labelSamplingStrategy,
    labelSamplingThreshold,
    labelSampleEvery,
    labelFontSize,
    tooltipFields,
    facetBackgroundField,
    facetBackgroundScheme,
    facetBackgroundOpacity,
    xAxisTickHeightPx,
    yAxisTickWidthPx,
  ]);

  const cancelGeneration = useCallback(() => {
    // No-op since Observable Plot generation is synchronous
  }, []);

  // Effect to handle chart specification generation (non-zoom changes)
  useEffect(() => {
    generateChartSpec();
  }, [generateChartSpec]);

  // Separate effect for zoom changes: debounce to avoid regenerating on every key press
  // This effect only runs when ganttZoomRange changes, and debounces the regeneration
  useEffect(() => {
    // Update the ref immediately so new generations use latest value
    ganttZoomRangeRef.current = ganttZoomRange;
    
    // Check if zoom has actually changed from what was last generated
    const lastZoom = lastGeneratedZoomRef.current;
    const currentZoom = ganttZoomRange;
    
    // Determine if zoom changed
    let zoomChanged = false;
    if (currentZoom !== lastZoom) {
      if (currentZoom === null || currentZoom === undefined) {
        // Zoom was reset to null
        zoomChanged = lastZoom !== null && lastZoom !== undefined;
      } else if (lastZoom === null || lastZoom === undefined) {
        // Zoom was set from null
        zoomChanged = true;
      } else {
        // Both are defined, compare values
        zoomChanged = currentZoom.min !== lastZoom.min || currentZoom.max !== lastZoom.max;
      }
    }
    
    if (!zoomChanged) {
      return;
    }
    
    // Clear any pending zoom regeneration
    if (zoomRegenTimerRef.current) {
      clearTimeout(zoomRegenTimerRef.current);
    }
    
    // Debounce the regeneration
    zoomRegenTimerRef.current = setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        devLog('[useChartGeneration] Debounced zoom regeneration triggered');
      }
      generateChartSpec();
    }, ZOOM_REGEN_DEBOUNCE_MS);
    
    return () => {
      if (zoomRegenTimerRef.current) {
        clearTimeout(zoomRegenTimerRef.current);
      }
    };
  }, [ganttZoomRange, generateChartSpec]);

  return {
    grid,
    chartInfo,
    renderingError,
    generateChartSpec,
    cancelGeneration,
    facetLimitWarning,
    onFacetLimitProceed,
    onFacetLimitCancel,
  };
};