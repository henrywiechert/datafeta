import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { Field } from '../../types';

export function barChart(context: ChartGenerationContext): Plot.PlotOptions {
  const { queryResult, xFields, yFields } = context;
  const data = queryResult.rows;

  const yMeasure = yFields.find(f => f.type === 'measure');
  const xMeasure = xFields.find(f => f.type === 'measure');

  const xDimension = xFields.find(f => f.type === 'dimension');
  const yDimension = yFields.find(f => f.type === 'dimension');

  if (yMeasure) {
    // Vertical bar chart
    return {
      marks: [
        Plot.barY(data, {
          x: xDimension ? xDimension.columnName : () => "Total",
          y: yMeasure.columnName,
          fill: "steelblue",
        }),
        Plot.ruleY([0])
      ],
      x: {
        label: xDimension ? xDimension.columnName : " ",
      },
      y: {
        grid: true,
        label: yMeasure.columnName,
      },
    };
  }

  if (xMeasure) {
    // Horizontal bar chart
    return {
      marks: [
        Plot.barX(data, {
          y: yDimension ? yDimension.columnName : () => "Total",
          x: xMeasure.columnName,
          fill: "steelblue",
        }),
        Plot.ruleX([0])
      ],
      y: {
        label: yDimension ? yDimension.columnName : " ",
      },
      x: {
        grid: true,
        label: xMeasure.columnName,
      },
    };
  }

  throw new Error('Bar chart requires at least one measure.');
} 