import { ChartGenerationContext, PlotResult } from '../types';
import { BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';
import { createHorizontalBarChart, createVerticalBarChart } from './shared/barChartHelpers';

export function barChart(context: ChartGenerationContext): PlotResult {
  const { queryResult, xFields, yFields } = context;
  const data = queryResult.rows;

  const yMeasure = yFields.find(f => f.type === 'measure');
  const xMeasure = xFields.find(f => f.type === 'measure');

  const xDimension = xFields.find(f => f.type === 'dimension');
  const yDimension = yFields.find(f => f.type === 'dimension');

  const barStep = BAR_STEP_PX; // Base step for bars

  let plotOptions;
  let title = '';

  if (yMeasure) {
    // Vertical bar chart (barY)
    const fieldForName = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    title = measureName;

    plotOptions = createVerticalBarChart(measureName, xDimension, data, undefined, barStep);
  } else if (xMeasure) {
    // Horizontal bar chart (barX)
    const fieldForName = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    title = measureName;

    plotOptions = createHorizontalBarChart(measureName, yDimension, data, undefined, barStep);
  } else {
    throw new Error('Bar chart requires at least one measure.');
  }

  // Return as a 1x1 grid layout
  return {
    library: 'observable-plot',
    plots: [
      {
        id: 'single-bar',
        title,
        options: plotOptions,
        position: { row: 0, col: 0 },
      }
    ],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr'],
    },
  };
}