import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';

export function barChart(context: ChartGenerationContext): Plot.PlotOptions {
  const { queryResult, xFields, yFields } = context;
  const data = queryResult.rows;

  const yMeasure = yFields.find(f => f.type === 'measure');
  const xMeasure = xFields.find(f => f.type === 'measure');

  const xDimension = xFields.find(f => f.type === 'dimension');
  const yDimension = yFields.find(f => f.type === 'dimension');

  const barStep = BAR_STEP_PX; // Base step for bars

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
      const categories = Array.from(new Set(data.map(row => row[xDimension.columnName])));
      const calculatedWidth = categories.length * barStep;
      
      return {
        width: calculatedWidth,
        marks: [
          Plot.barY(data, barConfig),
          Plot.ruleY([0])
        ],
        x: {
          label: xDimension.columnName,
          domain: categories as any,
          type: 'band' as any,
        },
        y: {
          grid: true,
          label: measureName,
        },
      };
    } else {
      // Single vertical bar - assign a constant category to position the bar
      const singleCategory = ' ';
      const configWithCategory: any = { ...barConfig, x: () => singleCategory };
      return {
        width: barStep * 2,
        marks: [
          Plot.barY(data, configWithCategory),
          Plot.ruleY([0])
        ],
        x: { label: singleCategory, domain: [singleCategory] as any, type: 'band' as any },
        y: { grid: true, label: measureName },
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
      const categories = Array.from(new Set(data.map(row => row[yDimension.columnName])));
      const calculatedHeight = categories.length * barStep;
      
      return {
        height: calculatedHeight,
        marks: [
          Plot.barX(data, barConfig),
          Plot.ruleX([0])
        ],
        y: {
          label: yDimension.columnName,
          domain: categories as any,
          type: 'band' as any,
        },
        x: {
          grid: true,
          label: measureName,
        },
      };
    } else {
      // Single horizontal bar - assign a constant category to position the bar
      const singleCategory = ' ';
      const configWithCategory: any = { ...barConfig, y: () => singleCategory };
      return {
        height: barStep * 2,
        marks: [
          Plot.barX(data, configWithCategory),
          Plot.ruleX([0])
        ],
        y: { label: singleCategory, domain: [singleCategory] as any, type: 'band' as any },
        x: { grid: true, label: measureName },
      };
    }
  }

  throw new Error('Bar chart requires at least one measure.');
} 