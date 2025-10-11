import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from '../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX, DEFAULT_COLOR_SCHEME } from '../../config/chartLayoutConfig';

/**
 * Generate multiple bar charts with shared axes for multiple measures
 */
export function multiMeasureBarChart(context: ChartGenerationContext): PlotResult {
  const { queryResult, xFields, yFields, colorField } = context;
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
  // Prepare color mapping if a color field is provided
  const colorColumnName = colorField ? getResultColumnName(colorField as any) : undefined;
  const colorDomain = colorColumnName
    ? Array.from(new Set((data || []).map((row: any) => row[colorColumnName]).filter((v: any) => v !== null && v !== undefined)))
    : undefined;

  const { plots, columnSizes, rowSizes } = generateMeasurePlots(
    xMeasures,
    yMeasures,
    xDimensions,
    yDimensions,
    data,
    sharedDomains,
    layoutType,
    colorColumnName,
    colorDomain as any[] | undefined
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
      const min = Math.min(...values);
      const max = Math.max(...values);
      const lower = Math.min(0, min);
      const upperRaw = Math.max(0, max);
      const upper = upperRaw === 0 ? 1 : upperRaw * 1.05; // +5% headroom above max when positive
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
  layoutType: 'horizontal' | 'vertical',
  colorColumnName?: string,
  colorDomain?: any[]
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
    // Measures on X; build categories from opposite-axis discrete dims when present
    // If faceting consumed them, local yDimensions will be empty and we will render a single-band chart
    const categoryDims = yDimensions.length > 0 ? yDimensions : xDimensions;
    const categoryLabel = categoryDims.length > 0 ? categoryDims.map((d: any) => d.columnName).join(' • ') : null;
    const categoryAccessor = categoryDims.length > 0 ? ((row: any) => categoryDims.map((d: any) => row[d.columnName]).join(' • ')) : null;
  const categories = categoryDims.length > 0 ? (Array.from(new Set(data.map(categoryAccessor as any))) as string[]) : null;
    const rowHeightPx = categories && categories.length > 0 ? Math.max(BAR_STEP * 2, categories.length * BAR_STEP) : BAR_STEP * 2;

    xMeasures.forEach((measure, index) => {
      const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
      const measureName = getResultColumnName(fieldForName);
      const plotOptions = createHorizontalBarChart(
        measureName,
        categoryLabel,
        categoryAccessor as any,
  categories as string[] | null,
        data,
        sharedDomains,
        BAR_STEP,
        colorColumnName,
        colorDomain
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
  // Measures on Y; build categories from opposite-axis discrete dims when present
  // If faceting consumed them, local xDimensions will be empty and we will render a single-band chart
  const categoryDims = xDimensions.length > 0 ? xDimensions : yDimensions;
  const categoryLabel = categoryDims.length > 0 ? categoryDims.map((d: any) => d.columnName).join(' • ') : null;
  const categoryAccessor = categoryDims.length > 0 ? ((row: any) => categoryDims.map((d: any) => row[d.columnName]).join(' • ')) : null;
  const categories = categoryDims.length > 0 ? (Array.from(new Set(data.map(categoryAccessor as any))) as string[]) : null;
  const columnWidthPx = categories && categories.length > 0 ? Math.max(BAR_STEP * 2, categories.length * BAR_STEP) : BAR_STEP * 2;

  yMeasures.forEach((measure, index) => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    const plotOptions = createVerticalBarChart(
      measureName,
      categoryLabel,
      categoryAccessor as any,
  categories as string[] | null,
      data,
      sharedDomains,
      BAR_STEP,
      colorColumnName,
      colorDomain
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
  BAR_STEP: number,
  colorColumnName?: string,
  colorDomain?: any[]
): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    x: {
      domain: sharedDomains[measureName], // Shared X domain starting at 0
      grid: true,
      label: measureName,
      nice: false,
    },
    marks: [],
  };

  if (categoryAccessor && categories && categories.length > 0) {
    // Horizontal bars with composite category on Y-axis
    const categoryCount = categories.length;
    plotOptions.height = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);
    plotOptions.y = { label: categoryLabel || ' ', domain: categories as any, type: 'band' as any, padding: 0.1 as any };
    // Aggregate by category to ensure a single bar per category
    const totalsByCat = new Map<string, number>();
    for (const row of data) {
      const cat = (categoryAccessor as any)(row) as string;
      const v = row?.[measureName];
      if (typeof v === 'number' && isFinite(v)) {
        totalsByCat.set(cat, (totalsByCat.get(cat) || 0) + v);
      }
    }
    const aggregated = categories.map((cat) => ({ cat, value: totalsByCat.get(cat) ?? 0 }));
    plotOptions.marks!.push(
      Plot.barX(aggregated as any, {
        x: 'value',
        y: 'cat' as any,
        fill: DEFAULT_CHART_COLOR,
        inset: 2 as any,
        tip: { pointer: 'x', preferredAnchor: 'top-right' },
      })
    );
  } else {
    // Single horizontal bar (aggregate across subset rows)
    plotOptions.height = BAR_STEP * 2;
    plotOptions.y = { label: ' ', domain: [' '] as any, type: 'band' as any, padding: 0.25 as any };
    const total = (data || [])
      .map((row: any) => row?.[measureName])
      .filter((v: any) => typeof v === 'number' && isFinite(v))
      .reduce((acc: number, v: number) => acc + v, 0);
    const single = [{ key: ' ', value: total }];
    plotOptions.marks!.push(
      Plot.barX(single, {
        x: 'value',
        y: 'key' as any,
        // When there is no category axis, avoid color channel to prevent overlapping bars
        fill: DEFAULT_CHART_COLOR,
        inset: 6 as any,
        tip: { pointer: 'x', preferredAnchor: 'top-right' },
      })
    );
  }

  if (colorColumnName && colorDomain && colorDomain.length > 0) {
    plotOptions.color = {
      domain: colorDomain as any,
      scheme: DEFAULT_COLOR_SCHEME as any,
      type: 'ordinal' as any,
    } as any;
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
  BAR_STEP: number,
  colorColumnName?: string,
  colorDomain?: any[]
): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    y: {
      domain: sharedDomains[measureName], // Shared Y domain starting at 0
      grid: true,
      label: measureName,
      nice: false,
    },
    marks: [],
  };

  if (categoryAccessor && categories && categories.length > 0) {
    // Vertical bars with composite category on X-axis
    const categoryCount = categories.length;
    plotOptions.width = Math.max(BAR_STEP * 2, categoryCount * BAR_STEP);
    plotOptions.x = { label: categoryLabel || ' ', domain: categories as any, type: 'band' as any, padding: 0.1 as any };
    // Aggregate by category to ensure a single bar per category
    const totalsByCat = new Map<string, number>();
    for (const row of data) {
      const cat = (categoryAccessor as any)(row) as string;
      const v = row?.[measureName];
      if (typeof v === 'number' && isFinite(v)) {
        totalsByCat.set(cat, (totalsByCat.get(cat) || 0) + v);
      }
    }
    const aggregated = categories.map((cat) => ({ cat, value: totalsByCat.get(cat) ?? 0 }));
    plotOptions.marks!.push(
      Plot.barY(aggregated as any, {
        y: 'value',
        x: 'cat' as any,
        fill: DEFAULT_CHART_COLOR,
        inset: 2 as any,
        tip: { pointer: 'y', preferredAnchor: 'top-right' },
      })
    );
  } else {
    // Single vertical bar (aggregate across subset rows)
    plotOptions.width = BAR_STEP * 2;
    plotOptions.x = { label: ' ', domain: [' '] as any, type: 'band' as any, padding: 0.25 as any };
    const total = (data || [])
      .map((row: any) => row?.[measureName])
      .filter((v: any) => typeof v === 'number' && isFinite(v))
      .reduce((acc: number, v: number) => acc + v, 0);
    const single = [{ key: ' ', value: total }];
    plotOptions.marks!.push(
      Plot.barY(single, {
        y: 'value',
        x: 'key' as any,
        fill: DEFAULT_CHART_COLOR,
        inset: 6 as any,
        tip: { pointer: 'y', preferredAnchor: 'top-right' },
      })
    );
  }

  if (colorColumnName && colorDomain && colorDomain.length > 0) {
    plotOptions.color = {
      domain: colorDomain as any,
      scheme: DEFAULT_COLOR_SCHEME as any,
      type: 'ordinal' as any,
    } as any;
  }

  return plotOptions;
}
