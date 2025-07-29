import { useCallback, useRef, useState, useEffect } from 'react';
import { generateVegaLiteSpec } from '../../../../spec-generator/specGeneratorV2';
import { vegaSpecGenerator } from '../../../../vega-spec-generator';
import { generatePlot } from '../../../../observable-plot-generator/observablePlotGenerator';
import { chartWorkerService } from '../../../../services/chartWorkerService';
import { getTimeoutForOperation } from '../../../../config/loadingConfig';
import { VegaLiteSpec } from '../../../../spec-generator/types';
import { PlotResult } from '../../../../observable-plot-generator/types';
import { ChartGenerationOptions } from '../types';
import { logOperationTiming, logOperationStart } from '../utils';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';

interface UseChartGenerationProps {
  xAxisFields: any[];
  yAxisFields: any[];
  useTableView: boolean;
  queryResult: any; // Add queryResult here
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: (operationType: 'query' | 'rendering' | 'metadata') => void;
}

interface UseChartGenerationReturn {
  spec: VegaLiteSpec | PlotResult | null;
  chartInfo: any | null;
  renderingError: string | null;
  generateChartSpec: () => Promise<void>;
  cancelGeneration: () => void;
}

export const useChartGeneration = ({
  xAxisFields,
  yAxisFields,
  useTableView,
  queryResult, // Destructure here
  startOperation,
  completeOperation,
}: UseChartGenerationProps): UseChartGenerationReturn => {
  const { state: { chartingLibrary } } = useVisualizationContext();
  const [spec, setSpec] = useState<VegaLiteSpec | PlotResult | null>(null);
  const [chartInfo, setChartInfo] = useState<any | null>(null);
  const [renderingError, setRenderingError] = useState<string | null>(null);
  
  const renderingAbortControllerRef = useRef<AbortController | null>(null);

  const generateChartSpec = useCallback(async () => {
    const startTime = Date.now();
    
    if ((xAxisFields.length === 0 && yAxisFields.length === 0) || useTableView) {
      setSpec(null);
      setChartInfo(null);
      setRenderingError(null);
      return;
    }

    // ============================================================================
    // OBSERVABLE PLOT PATH
    // ============================================================================
    if (chartingLibrary === 'observable-plot') {
      try {
        const plotResult = generatePlot({
          xFields: xAxisFields,
          yFields: yAxisFields,
          queryResult,
        });
        setSpec(plotResult);
        setChartInfo({ chartType: 'observable-plot' });
        setRenderingError(null);
        return;
      } catch (error) {
        console.error('Observable Plot generation failed:', error);
        setRenderingError(`Observable Plot generation failed: ${error}`);
        return;
      }
    }

    // ============================================================================
    // VEGA PATH: Custom low-level chart generation (PAUSED)
    // ============================================================================
    if (chartingLibrary === 'vega') {
      try {
        const vegaSpec = vegaSpecGenerator.generateSpec({ 
          xFields: xAxisFields, 
          yFields: yAxisFields, 
          queryResult 
        });
        setSpec(vegaSpec as any); // Cast to VegaLiteSpec for type compatibility
        setChartInfo({ chartType: 'vega-barchart' });
        setRenderingError(null);
        return;
      } catch (error) {
        console.error('Vega chart generation failed:', error);
        setRenderingError(`Vega generation failed: ${error}`);
        return;
      }
    }

    // ============================================================================
    // VEGA-LITE PATH: High-level chart generation with faceting (ACTIVE)
    // ============================================================================
    try {
      // Cancel any existing rendering operation
      if (renderingAbortControllerRef.current) {
        renderingAbortControllerRef.current.abort();
      }

      // Create new abort controller
      renderingAbortControllerRef.current = new AbortController();

      // Check if worker is available, fallback to sync generation
      if (!chartWorkerService.isWorkerAvailable()) {
        console.warn('Worker not available, using synchronous chart generation');
        
        startOperation('rendering', true); // Start operation for synchronous generation
        setRenderingError(null); // Clear previous errors after starting operation

        // Add a small delay to ensure the modal appears even for sync generation
        await new Promise(resolve => setTimeout(resolve, getTimeoutForOperation('rendering') + 50)); 
        
        try {
          const result = generateVegaLiteSpec({ xFields: xAxisFields, yFields: yAxisFields });
          // The function now returns both spec and chartInfo
          setSpec(result.spec);
          setChartInfo(result.chartInfo);
          setRenderingError(null);
          
          logOperationTiming('Chart generation', startTime, { mode: 'sync' });
        } catch (syncError: any) {
          console.error('Synchronous chart generation error:', syncError);
          setRenderingError(`Error generating chart: ${syncError.message || 'Unknown error'}`);
          setSpec(null);
          setChartInfo(null);
        }
        
        completeOperation('rendering');
        return;
      }
      
      startOperation('rendering', true); // Start operation for worker generation
      setRenderingError(null); // Clear previous errors after starting operation

      // Generate spec using Web Worker
      const result = await chartWorkerService.generateChartSpec(
        xAxisFields, 
        yAxisFields, 
        { 
          timeout: getTimeoutForOperation('worker'),
          signal: renderingAbortControllerRef.current?.signal 
        }
      );

      // Update state with result
      setSpec(result.spec);
      setChartInfo(result.chartInfo);
      setRenderingError(null);
      
      logOperationTiming('Chart generation', startTime, { mode: 'worker' });
      completeOperation('rendering');

    } catch (error: any) {
      console.error('Chart generation error:', error);
      
      if (error.code === 'CANCELLED') {
        // Operation was cancelled, don't set error
        setRenderingError(null);
      } else {
        // Set error and fallback to synchronous generation
        setRenderingError(error.message || 'Chart generation failed');
        
        try {
          console.log('Attempting fallback synchronous chart generation');
          const fallbackResult = generateVegaLiteSpec({ xFields: xAxisFields, yFields: yAxisFields });
          
          setSpec(fallbackResult.spec);
          setChartInfo(fallbackResult.chartInfo);
        } catch (fallbackError: any) {
          console.error('Fallback chart generation failed:', fallbackError);
          setSpec(null);
          setChartInfo(null);
          // Update error with fallback error details if available
          setRenderingError(`Chart generation failed: ${error.message}. Fallback also failed: ${fallbackError.message || 'Unknown error'}`);
        }
      }
      
      completeOperation('rendering');
    }
  }, [xAxisFields, yAxisFields, useTableView, startOperation, completeOperation, chartingLibrary, queryResult]);

  const cancelGeneration = useCallback(() => {
    if (renderingAbortControllerRef.current) {
      renderingAbortControllerRef.current.abort();
    }
  }, []);

  // Effect to handle chart specification generation
  useEffect(() => {
    generateChartSpec();
  }, [generateChartSpec]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (renderingAbortControllerRef.current) {
        renderingAbortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    spec,
    chartInfo,
    renderingError,
    generateChartSpec,
    cancelGeneration,
  };
};