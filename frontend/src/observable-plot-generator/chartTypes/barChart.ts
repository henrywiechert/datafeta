import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';

// Compute numeric extent for a column, ignoring non-finite values
function numericExtent(rows: any[], column: string): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const v = row[column];
    if (typeof v === 'number' && isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (min === Infinity || max === -Infinity) return [0, 0];
  return [min, max];
}

// Build a domain that always starts at 0 and pads the max by 5%
function paddedDomainIncludingZero(minVal: number, maxVal: number): [number, number] {
  // Upper bound is the positive max (or 0), padded by 5%
  const upperRaw = Math.max(0, maxVal);
  const upper = upperRaw === 0 ? 1 : upperRaw * 1.05;
  return [0, upper];
}

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

      // Ensure measure axis includes 0 and ends at max +5%
      const [minVal, maxVal] = numericExtent(data, measureName);
      const [d0, d1] = paddedDomainIncludingZero(minVal, maxVal);
      
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
          domain: [d0, d1] as any,
          nice: false,
        },
      };
    } else {
      // Single vertical bar - assign a constant category to position the bar
      const singleCategory = ' ';
      const configWithCategory: any = { ...barConfig, x: () => singleCategory };

      // Ensure measure axis includes 0 and ends at max +5%
      const [minVal, maxVal] = numericExtent(data, measureName);
      const [d0, d1] = paddedDomainIncludingZero(minVal, maxVal);

      return {
        width: barStep * 2,
        marks: [
          Plot.barY(data, configWithCategory),
          Plot.ruleY([0])
        ],
        x: { label: singleCategory, domain: [singleCategory] as any, type: 'band' as any },
        y: { grid: true, label: measureName, domain: [d0, d1] as any, nice: false },
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

      // Ensure measure axis includes 0 and ends at max +5%
      const [minVal, maxVal] = numericExtent(data, measureName);
      const [d0, d1] = paddedDomainIncludingZero(minVal, maxVal);
      
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
          domain: [d0, d1] as any,
          nice: false,
        },
      };
    } else {
      // Single horizontal bar - assign a constant category to position the bar
      const singleCategory = ' ';
      const configWithCategory: any = { ...barConfig, y: () => singleCategory };

      // Ensure measure axis includes 0 and ends at max +5%
      const [minVal, maxVal] = numericExtent(data, measureName);
      const [d0, d1] = paddedDomainIncludingZero(minVal, maxVal);

      return {
        height: barStep * 2,
        marks: [
          Plot.barX(data, configWithCategory),
          Plot.ruleX([0])
        ],
        y: { label: singleCategory, domain: [singleCategory] as any, type: 'band' as any },
        x: { grid: true, label: measureName, domain: [d0, d1] as any, nice: false },
      };
    }
  }

  throw new Error('Bar chart requires at least one measure.');
}