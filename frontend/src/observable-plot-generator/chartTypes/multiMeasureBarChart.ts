import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from '../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { 
  calculateSharedDomains, 
  createHorizontalBarChart, 
  createVerticalBarChart 
} from './shared/barChartHelpers';

/**
 * Generate multiple bar charts with shared axes for multiple measures
 */
export function multiMeasureBarChart(context: ChartGenerationContext): PlotResult {
  const { queryResult, xFields, yFields } = context;
  const data = queryResult.rows;

  const xMeasures = xFields.filter(f => f.type === 'measure');
  const yMeasures = yFields.filter(f => f.type === 'measure');
  const xDimensions = xFields.filter(f => f.type === 'dimension');
  const yDimensions = yFields.filter(f => f.type === 'dimension');

  // Determine if we have multiple measures
  const allMeasures = [...xMeasures, ...yMeasures];
  if (allMeasures.length <= 1) {
    // Fall back to single chart - not multi-measure
    throw new Error('Multi-measure chart requires multiple measures');
  }

  // Check for mixed axes - this should be handled by scatter plot instead
  if (xMeasures.length > 0 && yMeasures.length > 0) {
    throw new Error('Mixed-axis measures should be handled by scatter plot');
  }

  // Calculate shared domains for all measures
  const sharedDomains = calculateSharedDomains(allMeasures, data);
  
  // Determine layout based on where measures are placed
  const layoutType = xMeasures.length > 0 ? 'horizontal' : 'vertical';

  // Generate individual plots for each measure and position them
  const { plots, columnSizes, rowSizes } = generateMeasurePlots(
    xMeasures,
    yMeasures,
    xDimensions,
    yDimensions,
    data,
    sharedDomains,
    layoutType
  );

  return {
    library: 'observable-plot',
    plots,
    sharedDomains,
    layout: {
      type: 'grid',
      columns: layoutType === 'horizontal' ? plots.length : 1,
      rows: layoutType === 'horizontal' ? 1 : plots.length,
      columnSizes,
      rowSizes,
    },
  };
}

/**
 * Calculate shared domains across all measures
 */
// Moved to shared/barChartHelpers.ts

/**
 * Generate individual plot for each measure based on axis placement
 */
function generateMeasurePlots(
  xMeasures: any[],
  yMeasures: any[],
  xDimensions: any[],
  yDimensions: any[],
  data: any[],
  sharedDomains: any,
  layoutType: 'horizontal' | 'vertical'
): {
  plots: Array<{ id: string; title: string; options: Plot.PlotOptions; position: { row: number; col: number } }>;
  columnSizes: Array<number | 'fr'>;
  rowSizes: Array<number | 'fr'>;
} {
  const plots: Array<{
    id: string;
    title: string;
    options: Plot.PlotOptions;
    position: { row: number; col: number };
  }> = [];

  const BAR_STEP = BAR_STEP_PX;

  if (layoutType === 'horizontal') {
    // All plots share the same row; set row height from the categorical dimension
    const dimension = yDimensions[0];
    const categoryCount = dimension
      ? new Set(data.map((row) => row[dimension.columnName])).size
      : 1;
    const rowHeightPx = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);

    xMeasures.forEach((measure, index) => {
      const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
      const measureName = getResultColumnName(fieldForName);
      const plotOptions = createHorizontalBarChart(measureName, dimension, data, sharedDomains, BAR_STEP);

      plots.push({
        id: `x-measure-${index}`,
        title: measureName,
        options: plotOptions,
        position: { row: 0, col: index },
      });
    });

    return {
      plots,
      columnSizes: Array.from({ length: plots.length }, () => 'fr'),
      rowSizes: [rowHeightPx],
    };
  }

  // Vertical layout (Y measures): one column, multiple rows
  const dimension = xDimensions[0];
  const categoryCount = dimension
    ? new Set(data.map((row) => row[dimension.columnName])).size
    : 1;
  const columnWidthPx = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);

  yMeasures.forEach((measure, index) => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    const plotOptions = createVerticalBarChart(measureName, dimension, data, sharedDomains, BAR_STEP);

    plots.push({
      id: `y-measure-${index}`,
      title: measureName,
      options: plotOptions,
      position: { row: index, col: 0 },
    });
  });

  return {
    plots,
    columnSizes: [columnWidthPx],
    rowSizes: Array.from({ length: plots.length }, () => 'fr'),
  };
}

/**
 * Create horizontal bar chart (measure on X-axis)
 */
// Moved to shared/barChartHelpers.ts

/**
 * Create vertical bar chart (measure on Y-axis)
 */
// Moved to shared/barChartHelpers.ts
