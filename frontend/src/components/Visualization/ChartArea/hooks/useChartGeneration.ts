import { useCallback, useRef, useState, useEffect } from 'react';
import { generatePlot } from '../../../../observable-plot-generator/observablePlotGenerator';
import { getTimeoutForOperation } from '../../../../config/loadingConfig';
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
  spec: PlotResult | null;
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
  const [spec, setSpec] = useState<PlotResult | null>(null);
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
    // CHART GENERATION
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