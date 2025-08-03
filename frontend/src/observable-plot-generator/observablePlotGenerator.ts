import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from './types';
import { FacetingPipeline } from './facetingPipeline';
import { SingleChartLayer } from './layers/singleChartLayer';
import { MultiMeasureLayer } from './layers/multiMeasureLayer';
import { DimensionFacetingLayer } from './layers/dimensionFacetingLayer';

/**
 * Generate Observable Plot using the multi-layered faceting pipeline
 */
export function generatePlot(context: ChartGenerationContext): PlotResult {
  const { xFields, yFields, queryResult } = context;

  // Check if we have any fields to work with
  if (xFields.length === 0 && yFields.length === 0) {
    return {
      library: 'observable-plot',
      options: {
        marks: [
          Plot.text(['Drag fields to the axes to create a chart.'])
        ]
      },
    };
  }

  // Check if we have any measures
  const hasMeasure = [...xFields, ...yFields].some(f => f.type === 'measure');
  
  if (!hasMeasure) {
    return {
      library: 'observable-plot',
      options: {
        marks: [
          Plot.text(['Drag a measure to an axis to create a bar chart.'])
        ]
      },
    };
  }

  try {
    // Create the faceting pipeline with all layers
    const pipeline = new FacetingPipeline([
      new SingleChartLayer(),
      new MultiMeasureLayer(),
      new DimensionFacetingLayer()
    ]);

    // Process fields through the pipeline
    const result = pipeline.process(xFields, yFields, queryResult);

    // For now, return the first chart (Observable Plot renders one chart at a time)
    // TODO: Future enhancement could handle multiple charts via layout or other means
    if (result.charts.length > 0) {
      const primaryChart = result.charts[0];
      
      // Log pipeline results for debugging
      console.log('🎯 Pipeline Results:', {
        totalCharts: result.charts.length,
        remainingFields: {
          x: result.finalContext.remainingXFields.map(f => f.columnName),
          y: result.finalContext.remainingYFields.map(f => f.columnName)
        },
        consumedFields: {
          x: result.finalContext.consumedFields.xFields.map(f => f.columnName),
          y: result.finalContext.consumedFields.yFields.map(f => f.columnName)
        }
      });

      return {
        library: 'observable-plot',
        options: primaryChart.plotOptions,
        // Store additional charts for potential future use
        additionalCharts: result.charts.slice(1),
        pipelineInfo: {
          totalCharts: result.charts.length,
          remainingFields: result.finalContext.remainingXFields.length + result.finalContext.remainingYFields.length
        }
      };
    } else {
      throw new Error('Pipeline did not generate any charts');
    }

  } catch (error) {
    console.error('Pipeline processing failed:', error);
    
    // Fallback to simple chart generation
    return {
      library: 'observable-plot',
      options: {
        marks: [
          Plot.text([`Error: ${error instanceof Error ? error.message : 'Unknown error'}`])
        ]
      },
    };
  }
} 