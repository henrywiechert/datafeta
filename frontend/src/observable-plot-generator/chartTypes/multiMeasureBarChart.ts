import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from '../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../../config/chartLayoutConfig';

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
    
    const values = data.map(row => row[measureName]).filter(v => typeof v === 'number' && isFinite(v));
    if (values.length > 0) {
      const max = Math.max(0, ...values);
      const upper = max === 0 ? 1 : max * 1.05; // +5% headroom
      domains[measureName] = [0, upper];
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

  const BAR_STEP = BAR_STEP_PX;

  if (layoutType === 'horizontal') {
    // Measures on X; categories on Y built from ALL dimensions on the opposite axis (fallback to same-axis)
    const categoryDims = yDimensions.length > 0 ? yDimensions : xDimensions;
    const categoryLabel = categoryDims.length > 0 ? categoryDims.map((d: any) => d.columnName).join(' • ') : ' ';
    const categoryAccessor = (row: any) =>
      categoryDims.length > 0 ? categoryDims.map((d: any) => row[d.columnName]).join(' • ') : ' ';
    const categories = Array.from(new Set(data.map(categoryAccessor)));
    const categoryCount = categories.length || 1;
    const rowHeightPx = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);

    xMeasures.forEach((measure, index) => {
      const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
      const measureName = getResultColumnName(fieldForName);
      const plotOptions = createHorizontalBarChart(
        measureName,
        categoryLabel,
        categoryAccessor,
        categories,
        data,
        sharedDomains,
        BAR_STEP
      );

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
  // Categories on X built from ALL dimensions on the opposite axis (fallback to same-axis)
  const categoryDims = xDimensions.length > 0 ? xDimensions : yDimensions;
  const categoryLabel = categoryDims.length > 0 ? categoryDims.map((d: any) => d.columnName).join(' • ') : ' ';
  const categoryAccessor = (row: any) =>
    categoryDims.length > 0 ? categoryDims.map((d: any) => row[d.columnName]).join(' • ') : ' ';
  const categories = Array.from(new Set(data.map(categoryAccessor)));
  const categoryCount = categories.length || 1;
  const columnWidthPx = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);

  yMeasures.forEach((measure, index) => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    const plotOptions = createVerticalBarChart(
      measureName,
      categoryLabel,
      categoryAccessor,
      categories,
      data,
      sharedDomains,
      BAR_STEP
    );

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
  categoryLabel: string | null,
  categoryAccessor: ((row: any) => string) | null,
  categories: string[] | null,
  data: any[],
  sharedDomains: any,
  BAR_STEP: number
): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    x: {
      domain: sharedDomains[measureName], // Shared X domain starting at 0
      grid: true,
      label: measureName,
      nice: false,
    },
    marks: [Plot.ruleX([0])],
  };

  if (categoryAccessor && categories && categories.length > 0) {
    // Horizontal bars with composite category on Y-axis
    const categoryCount = categories.length;
    plotOptions.height = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);
    plotOptions.y = { label: categoryLabel || ' ', domain: categories as any, type: 'band' as any, padding: 0.1 as any };
    plotOptions.marks!.push(
      Plot.barX(data, {
        x: measureName,
        y: categoryAccessor as any,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  } else {
    // Single horizontal bar
    plotOptions.height = BAR_STEP * 2;
    plotOptions.y = { label: ' ', domain: [' '] as any, type: 'band' as any };
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
  categoryLabel: string | null,
  categoryAccessor: ((row: any) => string) | null,
  categories: string[] | null,
  data: any[],
  sharedDomains: any,
  BAR_STEP: number
): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    y: {
      domain: sharedDomains[measureName], // Shared Y domain starting at 0
      grid: true,
      label: measureName,
      nice: false,
    },
    marks: [Plot.ruleY([0])],
  };

  if (categoryAccessor && categories && categories.length > 0) {
    // Vertical bars with composite category on X-axis
    const categoryCount = categories.length;
    plotOptions.width = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);
    plotOptions.x = { label: categoryLabel || ' ', domain: categories as any, type: 'band' as any, padding: 0.1 as any };
    plotOptions.marks!.push(
      Plot.barY(data, {
        x: categoryAccessor as any,
        y: measureName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  } else {
    // Single vertical bar
    plotOptions.width = BAR_STEP * 2;
    plotOptions.x = { label: ' ', domain: [' '] as any, type: 'band' as any };
    plotOptions.marks!.push(
      Plot.barY(data, {
        y: measureName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  }

  return plotOptions;
}
