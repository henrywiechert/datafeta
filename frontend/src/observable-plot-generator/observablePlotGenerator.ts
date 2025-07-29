import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from './types';
import { barChart } from './chartTypes/barChart';

export function generatePlot(context: ChartGenerationContext): PlotResult {
  const { xFields, yFields } = context;

  // Simple field classification
  const hasMeasure = [...xFields, ...yFields].some(f => f.type === 'measure');

  let plotOptions: Plot.PlotOptions;

  if (hasMeasure) {
    plotOptions = barChart(context);
  } else {
    // Fallback for other chart types or no data
    plotOptions = {
      marks: [
        Plot.text(['Drag a measure to an axis to create a bar chart.'])
      ]
    };
  }

  const plot = Plot.plot(plotOptions);

  return {
    library: 'observable-plot',
    plot,
  };
} 