import { useCallback, useState, useEffect } from 'react';
import { generatePlot } from '../../../../observable-plot-generator/observablePlotGenerator';
import { PlotResult } from '../../../../observable-plot-generator/types';
import { Field, FieldOverrideState, UserChartType } from '../../../../types';
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
      if (process.env.NODE_ENV === 'development') {
        console.log('[useChartGeneration] Starting rendering operation');
      }
      startOperation('rendering', true);
      setRenderingError(null);

      // CRITICAL: Yield to event loop BEFORE starting heavy synchronous work
      // This allows the modal timeout to fire and display the modal
      await new Promise(resolve => setTimeout(resolve, 0));

      const overrideTargets = computeOverrideTargets(
        xAxisFields as Field[],
        yAxisFields as Field[],
        measureValuesSourceFields
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
        globalChartType,
        measureValuesSourceFields,
      });
      
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
  }, [xAxisFields, yAxisFields, colorField, colorScheme, colorBias, manualColor, sizeField, sizeRange, manualSize, useTableView, startOperation, completeOperation, queryResult, queryVersion, labelFields, labelsEnabled, labelSamplingStrategy, labelSamplingThreshold, labelSampleEvery, tooltipFields, fieldOverrides, globalChartType, measureValuesSourceFields]);

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