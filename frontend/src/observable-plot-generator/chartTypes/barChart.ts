import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { getResultColumnName } from '../../utils/fieldUtils';

export function barChart(context: ChartGenerationContext): Plot.PlotOptions {
  const { queryResult, xFields, yFields } = context;
  const data = queryResult.rows;

  const yMeasure = yFields.find(f => f.type === 'measure');
  const xMeasure = xFields.find(f => f.type === 'measure');

  const xDimension = xFields.find(f => f.type === 'dimension');
  const yDimension = yFields.find(f => f.type === 'dimension');

  const barStep = 40; // Includes bar and padding

  if (yMeasure) {
    // Create a temporary field with a default aggregation to avoid state mutation
    const fieldForName = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);

    const categorySet = xDimension ? new Set(data.map(row => row[xDimension.columnName])) : new Set(["Total"]);
    const calculatedWidth = (categorySet.size || 1) * barStep;

    // Vertical bar chart
    return {
      width: calculatedWidth,
      marks: [
        Plot.barY(data, {
          x: xDimension ? xDimension.columnName : () => "Total",
          y: measureName,
          fill: "steelblue",
        }),
        Plot.ruleY([0])
      ],
      x: {
        label: xDimension ? xDimension.columnName : " ",
      },
      y: {
        grid: true,
        label: measureName,
      },
    };
  }

  if (xMeasure) {
    // Create a temporary field with a default aggregation to avoid state mutation
    const fieldForName = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);

    const categorySet = yDimension ? new Set(data.map(row => row[yDimension.columnName])) : new Set(["Total"]);
    const calculatedHeight = (categorySet.size || 1) * barStep;

    // Horizontal bar chart
    return {
      height: calculatedHeight,
      marks: [
        Plot.barX(data, {
          y: yDimension ? yDimension.columnName : () => "Total",
          x: measureName,
          fill: "steelblue",
        }),
        Plot.ruleX([0])
      ],
      y: {
        label: yDimension ? yDimension.columnName : " ",
      },
      x: {
        grid: true,
        label: measureName,
      },
    };
  }

  throw new Error('Bar chart requires at least one measure.');
} 