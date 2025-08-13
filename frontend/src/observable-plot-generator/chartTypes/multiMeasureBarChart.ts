import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from '../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';

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
function calculateSharedDomains(measures: any[], data: any[]) {
  const domains: any = {};

  // For each measure, calculate its domain
  measures.forEach(measure => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    
    const values = data.map(row => row[measureName]).filter(v => v != null);
    if (values.length > 0) {
      const max = Math.max(...values);
      const min = Math.min(...values);

      // For measures, include 0 baseline; clamp upper to 0 if all values are ≤ 0
      const lower = Math.min(0, min);
      const upper = max <= 0 ? 0 : max * 1.1; // 10% headroom when positive
      domains[measureName] = [lower, upper];
    }
  });

  return domains;
}

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

  const BAR_STEP = 40; // consider importing from config if needed

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
function createHorizontalBarChart(
  measureName: string,
  dimension: any,
  data: any[],
  sharedDomains: any,
  BAR_STEP: number
): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    x: {
      domain: sharedDomains[measureName], // Shared X domain
      grid: true,
      label: measureName,
    },
    marks: [Plot.ruleX([0])],
  };

  if (dimension) {
    // Horizontal bars with dimension on Y-axis
    const categoryCount = new Set(data.map((row) => row[dimension.columnName])).size;
    plotOptions.height = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);
    plotOptions.y = { label: dimension.columnName };
    plotOptions.marks!.push(
      Plot.barX(data, {
        x: measureName,
        y: dimension.columnName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  } else {
    // Single horizontal bar
    plotOptions.height = BAR_STEP * 2;
    plotOptions.y = { label: ' ' };
    plotOptions.marks!.push(
      Plot.barX(data, {
        x: measureName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  }

  return plotOptions;
}

/**
 * Create vertical bar chart (measure on Y-axis)
 */
function createVerticalBarChart(
  measureName: string,
  dimension: any,
  data: any[],
  sharedDomains: any,
  BAR_STEP: number
): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    y: {
      domain: sharedDomains[measureName], // Shared Y domain
      grid: true,
      label: measureName,
    },
    marks: [Plot.ruleY([0])],
  };

  if (dimension) {
    // Vertical bars with dimension on X-axis
    const categoryCount = new Set(data.map((row) => row[dimension.columnName])).size;
    plotOptions.width = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);
    plotOptions.x = { label: dimension.columnName };
    plotOptions.marks!.push(
      Plot.barY(data, {
        x: dimension.columnName,
        y: measureName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  } else {
    // Single vertical bar
    plotOptions.width = BAR_STEP * 2;
    plotOptions.x = { label: ' ' };
    plotOptions.marks!.push(
      Plot.barY(data, {
        y: measureName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  }

  return plotOptions;
}
