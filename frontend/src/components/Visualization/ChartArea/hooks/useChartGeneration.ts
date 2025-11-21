import { useCallback, useState, useEffect } from 'react';
import { generatePlot } from '../../../../observable-plot-generator/observablePlotGenerator';
import { PlotResult } from '../../../../observable-plot-generator/types';
import { Field, FieldOverrideState } from '../../../../types';
import { computeOverrideTargets } from '../../../../observable-plot-generator/utils/fieldOverrides';
import { logOperationTiming } from '../utils';

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
  useTableView: boolean;
  queryResult: any; // Add queryResult here
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: (operationType: 'query' | 'rendering' | 'metadata') => void;
  labelFields?: Field[];
  labelsEnabled?: boolean;
  labelSamplingStrategy?: 'auto' | 'all' | 'sample';
  labelSamplingThreshold?: number;
  labelSampleEvery?: number;
  tooltipFields?: Field[];
  fieldOverrides?: Record<string, FieldOverrideState>;
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
  colorScheme,
  colorBias = 0,
  manualColor,
  sizeField,
  sizeRange,
  manualSize,
  useTableView,
  queryResult, // Destructure here
  startOperation,
  completeOperation,
  labelFields = [],
  labelsEnabled = false,
  labelSamplingStrategy = 'auto',
  labelSamplingThreshold = 300,
  labelSampleEvery = 1,
  tooltipFields = [],
  fieldOverrides = {},
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

    // Don't generate chart if we have fields but no query result yet
    if (!queryResult) {
      return;
    }

    try {
      startOperation('rendering', true);
      setRenderingError(null);

      const overrideTargets = computeOverrideTargets(
        xAxisFields as Field[],
        yAxisFields as Field[]
      );

      const plotResult = generatePlot({
        xFields: xAxisFields,
        yFields: yAxisFields,
        colorField: colorField || undefined,
        colorScheme,
        colorBias,
        manualColor,
        sizeField: sizeField || undefined,
        sizeRange,
        manualSize,
        queryResult,
        labelFields,
        labelsEnabled,
        labelSamplingStrategy,
        labelSamplingThreshold,
        labelSampleEvery,
        tooltipFields,
        fieldOverrides,
        fieldOverrideTargets: overrideTargets,
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
  }, [xAxisFields, yAxisFields, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, useTableView, startOperation, completeOperation, queryResult, labelFields, labelsEnabled, labelSamplingStrategy, labelSamplingThreshold, labelSampleEvery, tooltipFields, fieldOverrides]);

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