import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';

export function barChart(context: ChartGenerationContext): Plot.PlotOptions {
  const { queryResult, xFields, yFields } = context;
  const data = queryResult.rows;

  const yMeasure = yFields.find(f => f.type === 'measure');
  const xMeasure = xFields.find(f => f.type === 'measure');

  const xDimension = xFields.find(f => f.type === 'dimension');
  const yDimension = yFields.find(f => f.type === 'dimension');

  const barStep = 40; // Base step for bars

  if (yMeasure) {
    // Vertical bar chart (barY)
    const fieldForName = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);

    const barConfig: any = {
      y: measureName,
      fill: DEFAULT_CHART_COLOR,
    };
    
    // Only add x field if we have a dimension
    if (xDimension) {
      barConfig.x = xDimension.columnName;
      const categorySet = new Set(data.map(row => row[xDimension.columnName]));
      const calculatedWidth = categorySet.size * barStep;
      
      return {
        width: calculatedWidth,
        marks: [
          Plot.barY(data, barConfig),
          Plot.ruleY([0])
        ],
        x: {
          label: xDimension.columnName,
        },
        y: {
          grid: true,
          label: measureName,
        },
      };
    } else {
      // Single vertical bar - let it span full horizontal extent
      return {
        width: barStep * 2, // Give it a reasonable minimum width
        marks: [
          Plot.barY(data, barConfig),
          Plot.ruleY([0])
        ],
        x: {
          label: " ",
        },
        y: {
          grid: true,
          label: measureName,
        },
      };
    }
  }

  if (xMeasure) {
    // Horizontal bar chart (barX)
    const fieldForName = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);

    const barConfig: any = {
      x: measureName,
      fill: DEFAULT_CHART_COLOR,
    };
    
    // Only add y field if we have a dimension
    if (yDimension) {
      barConfig.y = yDimension.columnName;
      const categorySet = new Set(data.map(row => row[yDimension.columnName]));
      const calculatedHeight = categorySet.size * barStep;
      
      return {
        height: calculatedHeight,
        marks: [
          Plot.barX(data, barConfig),
          Plot.ruleX([0])
        ],
        y: {
          label: yDimension.columnName,
        },
        x: {
          grid: true,
          label: measureName,
        },
      };
    } else {
      // Single horizontal bar - let it span full vertical extent
      return {
        height: barStep * 2, // Give it a reasonable minimum height
        marks: [
          Plot.barX(data, barConfig),
          Plot.ruleX([0])
        ],
        y: {
          label: " ",
        },
        x: {
          grid: true,
          label: measureName,
        },
      };
    }
  }

  throw new Error('Bar chart requires at least one measure.');
} 