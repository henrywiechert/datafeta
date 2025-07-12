import { useCallback, useRef, useState, useEffect } from 'react';
import { generateVegaLiteSpec } from '../../../../spec-generator/specGenerator';
import { chartWorkerService } from '../../../../services/chartWorkerService';
import { getTimeoutForOperation } from '../../../../config/loadingConfig';
import { VegaLiteSpec } from '../../../../spec-generator/types';
import { ChartGenerationOptions } from '../types';
import { logOperationTiming, logOperationStart } from '../utils';

interface UseChartGenerationProps {
  xAxisFields: any[];
  yAxisFields: any[];
  useTableView: boolean;
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: () => void;
}

interface UseChartGenerationReturn {
  spec: VegaLiteSpec | null;
  chartInfo: any | null;
  renderingError: string | null;
  generateChartSpec: () => Promise<void>;
  cancelGeneration: () => void;
}

export const useChartGeneration = ({
  xAxisFields,
  yAxisFields,
  useTableView,
  startOperation,
  completeOperation,
}: UseChartGenerationProps): UseChartGenerationReturn => {
  const [spec, setSpec] = useState<VegaLiteSpec | null>(null);
  const [chartInfo, setChartInfo] = useState<any | null>(null);
  const [renderingError, setRenderingError] = useState<string | null>(null);
  
  const renderingAbortControllerRef = useRef<AbortController | null>(null);

  const generateChartSpec = useCallback(async () => {
    const startTime = Date.now();
    logOperationStart('generateChartSpec', { 
      xFields: xAxisFields.length, 
      yFields: yAxisFields.length 
    });
    
    // Skip if no fields or if we're using table view
    if ((xAxisFields.length === 0 && yAxisFields.length === 0) || useTableView) {
      console.log('⏭️ Skipping chart generation', { 
        noFields: xAxisFields.length === 0 && yAxisFields.length === 0,
        useTableView 
      });
      setSpec(null);
      setChartInfo(null);
      setRenderingError(null);
      return;
    }

    try {
      // Cancel any existing rendering operation
      if (renderingAbortControllerRef.current) {
        renderingAbortControllerRef.current.abort();
      }

      // Create new abort controller
      renderingAbortControllerRef.current = new AbortController();

      // Start rendering operation
      startOperation('rendering', true);
      setRenderingError(null);

      // Check if worker is available, fallback to sync generation
      if (!chartWorkerService.isWorkerAvailable()) {
        console.warn('🔄 Chart worker not available, falling back to synchronous generation');
        
        // Add a small delay to ensure the modal appears even for sync generation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const syncSpec = generateVegaLiteSpec({ xFields: xAxisFields, yFields: yAxisFields });
        setSpec(syncSpec);
        setChartInfo(null);
        
        logOperationTiming('Chart generation', startTime, { mode: 'sync' });
        completeOperation();
        return;
      }

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
      
      logOperationTiming('Chart generation', startTime, { mode: 'worker' });
      completeOperation();

    } catch (error: any) {
      console.error('Chart generation error:', error);
      
      if (error.code === 'CANCELLED') {
        // Operation was cancelled, don't set error
        setRenderingError(null);
      } else {
        // Set error and fallback to synchronous generation
        setRenderingError(error.message || 'Chart generation failed');
        
        try {
          const fallbackSpec = generateVegaLiteSpec({ xFields: xAxisFields, yFields: yAxisFields });
          setSpec(fallbackSpec);
          setChartInfo(null);
        } catch (fallbackError) {
          console.error('Fallback chart generation failed:', fallbackError);
          setSpec(null);
          setChartInfo(null);
        }
      }
      
      completeOperation();
    }
  }, [xAxisFields, yAxisFields, useTableView, startOperation, completeOperation]);

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