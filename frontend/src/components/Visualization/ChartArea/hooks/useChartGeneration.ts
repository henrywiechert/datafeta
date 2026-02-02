import { useCallback, useState, useEffect, useRef } from 'react';
import { generatePlot } from '../../../../observable-plot-generator/observablePlotGenerator';
import { PlotResult, ChartGenerationContext, GanttZoomRange } from '../../../../observable-plot-generator/types';
import { Field, FieldOverrideState, UserChartType } from '../../../../types';
import { computeOverrideTargets } from '../../../../observable-plot-generator/utils/fieldOverrides';
import { logOperationTiming } from '../utils';
import { planFacets } from '../../../../observable-plot-generator/faceting/facetPlanner';
import { validateFacetCounts, FacetValidationResult } from '../../../../observable-plot-generator/faceting/facetValidation';
import { useFieldAliasLookup } from '../../../../hooks/useFieldDisplayName';

/** Debounce delay for zoom-triggered regeneration (ms) */
const ZOOM_REGEN_DEBOUNCE_MS = 150;

interface UseChartGenerationProps {
  xAxisFields: any[];
  yAxisFields: any[];
  colorField: Field | null;
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;
  sizeField: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  bandThicknessScale: number;
  useTableView: boolean;
  queryResult: any; // Add queryResult here
  queryVersion?: number; // Add queryVersion to detect union/join changes
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: (operationType: 'query' | 'rendering' | 'metadata') => void;
  labelFields?: Field[];
  labelsEnabled?: boolean;
  labelSamplingStrategy?: 'auto' | 'all' | 'sample';
  labelSamplingThreshold?: number;
  labelSampleEvery?: number;
  tooltipFields?: Field[];
  fieldOverrides?: Record<string, FieldOverrideState>;
  globalChartType?: UserChartType | null;
  measureValuesSourceFields?: Field[];
  independentDomains?: { x?: boolean; y?: boolean };
  ganttZoomRange?: GanttZoomRange | null;
}

interface UseChartGenerationReturn {
  spec: PlotResult | null;
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
  colorField,
  colorScheme,
  colorBias = 0,
  manualColor,
  sizeField,
  sizeRange,
  manualSize,
  bandThicknessScale,
  useTableView,
  queryResult, // Destructure here
  queryVersion, // Destructure queryVersion
  startOperation,
  completeOperation,
  labelFields = [],
  labelsEnabled = false,
  labelSamplingStrategy = 'auto',
  labelSamplingThreshold = 300,
  labelSampleEvery = 1,
  tooltipFields = [],
  fieldOverrides = {},
  globalChartType,
  measureValuesSourceFields = [],
  independentDomains,
  ganttZoomRange,
}: UseChartGenerationProps): UseChartGenerationReturn => {
  const [spec, setSpec] = useState<PlotResult | null>(null);
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
    const plotResult = generatePlot(context);
    
    const plotCount = plotResult.plots?.length || 0;
    if (process.env.NODE_ENV === 'development') {
      console.log('[useChartGeneration] Generated spec with', plotCount, 'plots');
    }
    
    // For large numbers of plots, the synchronous DOM rendering will block
    // the main thread for seconds. Yield to the event loop BEFORE setting
    // the spec to give the modal a chance to appear.
    if (plotCount > 100) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useChartGeneration] Large plot count detected, yielding to show modal');
      }
      // Yield to event loop to let modal appear
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    setSpec(plotResult);
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
        console.log('[useChartGeneration] User proceeded despite facet limit warning');
      }
      startOperation('rendering', true);
      
      // Yield to let UI update
      await new Promise(resolve => setTimeout(resolve, 0));
      
      await doGenerateChart(pending.context, pending.overrideTargets, pending.startTime);
    } catch (error: any) {
      console.error('Observable Plot generation failed:', error);
      setRenderingError(`Chart generation failed: ${error.message || 'Unknown error'}`);
      setSpec(null);
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
    
    if ((xAxisFields.length === 0 && yAxisFields.length === 0) || useTableView) {
      setSpec(null);
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
        tooltipFields,
        fieldOverrides,
        fieldOverrideTargets: overrideTargets,
        globalChartType,
        measureValuesSourceFields,
        independentDomains,
        ganttZoomRange: ganttZoomRangeRef.current,
        fieldAliasLookup,
      };
      
      // Track which zoom range we generated with
      lastGeneratedZoomRef.current = ganttZoomRangeRef.current;

      // Check if faceting would be applied and validate facet counts
      const facetPlan = planFacets(context);
      if (facetPlan && (facetPlan.rowFacetFields.length > 0 || facetPlan.colFacetFields.length > 0)) {
        const validation = validateFacetCounts(context, facetPlan);
        
        if (!validation.isValid) {
          // Store context for potential proceed
          pendingGenerationRef.current = { context, overrideTargets, startTime };
          setFacetLimitWarning(validation);
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[useChartGeneration] Facet limit exceeded:', validation);
          }
          // Don't proceed - wait for user decision
          return;
        }
      }

      // Clear any previous warning
      setFacetLimitWarning(null);

      if (process.env.NODE_ENV === 'development') {
        console.log('[useChartGeneration] Starting rendering operation');
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
      setSpec(null);
      setChartInfo(null);
      // On error, complete the operation immediately since no rendering will happen
      completeOperation('rendering');
    }
  }, [xAxisFields, yAxisFields, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, bandThicknessScale, useTableView, startOperation, completeOperation, queryResult, queryVersion, labelFields, labelsEnabled, labelSamplingStrategy, labelSamplingThreshold, labelSampleEvery, tooltipFields, fieldOverrides, globalChartType, measureValuesSourceFields, independentDomains, doGenerateChart, fieldAliasLookup]);

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
        console.log('[useChartGeneration] Debounced zoom regeneration triggered');
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
    spec,
    chartInfo,
    renderingError,
    generateChartSpec,
    cancelGeneration,
    facetLimitWarning,
    onFacetLimitProceed,
    onFacetLimitCancel,
  };
};