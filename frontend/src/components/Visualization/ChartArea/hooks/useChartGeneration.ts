import { useCallback, useState, useEffect } from 'react';
import { generatePlot } from '../../../../observable-plot-generator/observablePlotGenerator';
import { PlotResult } from '../../../../observable-plot-generator/types';
import { Field } from '../../../../types';
import { logOperationTiming } from '../utils';

interface UseChartGenerationProps {
  xAxisFields: any[];
  yAxisFields: any[];
  colorField: Field | null;
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
  colorField,
  useTableView,
  queryResult, // Destructure here
  startOperation,
  completeOperation,
}: UseChartGenerationProps): UseChartGenerationReturn => {
  const [spec, setSpec] = useState<PlotResult | null>(null);
  const [chartInfo, setChartInfo] = useState<any | null>(null);
  const [renderingError, setRenderingError] = useState<string | null>(null);

  const generateChartSpec = useCallback(async () => {
    const startTime = Date.now();
    
    if ((xAxisFields.length === 0 && yAxisFields.length === 0) || useTableView) {
      setSpec(null);
      setChartInfo(null);
      setRenderingError(null);
      return;
    }

    try {
      startOperation('rendering', true);
      setRenderingError(null);

      const plotResult = generatePlot({
        xFields: xAxisFields,
        yFields: yAxisFields,
        colorField: colorField || undefined,
        queryResult,
      });
      
      setSpec(plotResult);
      setChartInfo({ chartType: 'observable-plot' });
      setRenderingError(null);
      
      logOperationTiming('Chart generation', startTime, { mode: 'observable-plot' });
      completeOperation('rendering');
      
    } catch (error: any) {
      console.error('Observable Plot generation failed:', error);
      setRenderingError(`Chart generation failed: ${error.message || 'Unknown error'}`);
      setSpec(null);
      setChartInfo(null);
      completeOperation('rendering');
    }
  }, [xAxisFields, yAxisFields, colorField, useTableView, startOperation, completeOperation, queryResult]);

  const cancelGeneration = useCallback(() => {
    // No-op since Observable Plot generation is synchronous
  }, []);

  // Effect to handle chart specification generation
  useEffect(() => {
    generateChartSpec();
  }, [generateChartSpec]);

  return {
    spec,
    chartInfo,
    renderingError,
    generateChartSpec,
    cancelGeneration,
  };
};