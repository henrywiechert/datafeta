import { ChartGenerationContext, PlotResult } from '../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { buildBarOptions, resolveMeasureAlias, computeBandPaddingFromSizeField } from './barCore';

/**
 * Generate multiple bar charts with shared axes for multiple measures
 */
export function multiMeasureBarChart(context: ChartGenerationContext): PlotResult {
  const { queryResult, xFields, yFields, sizeField, manualSize } = context;
  const data = queryResult.rows;

  const xMeasures = xFields.filter(f => f.type === 'measure');
  const yMeasures = yFields.filter(f => f.type === 'measure');
  const xDimensions = xFields.filter(f => f.type === 'dimension');
  const yDimensions = yFields.filter(f => f.type === 'dimension');

  const allMeasures = [...xMeasures, ...yMeasures];
  if (allMeasures.length <= 1) throw new Error('Multi-measure chart requires multiple measures');
  if (xMeasures.length > 0 && yMeasures.length > 0) throw new Error('Mixed-axis measures should be handled by scatter plot');

  const sharedDomains = calculateSharedDomains(allMeasures, data);
  const layoutType: 'horizontal' | 'vertical' = xMeasures.length > 0 ? 'horizontal' : 'vertical';

  // Category dimension strategy replicating legacy logic:
  // Use opposite-axis dimensions if present; otherwise fallback to same-axis dims (if any).
  const categoryDims = layoutType === 'horizontal'
    ? (yDimensions.length > 0 ? yDimensions : xDimensions)
    : (xDimensions.length > 0 ? xDimensions : yDimensions);

  const hasCategories = categoryDims.length > 0;
  const categoryAccessor = hasCategories
    ? (row: any) => categoryDims.map((d: any) => row[d.columnName]).join(' • ')
    : undefined;
  const categories = hasCategories
    ? Array.from(new Set(data.map(categoryAccessor as any))) as string[]
    : undefined;

  // Synthetic category column for multi-dimension composite keys
  const categoryColumn = hasCategories ? '__category' : undefined;

  // Precompute aggregated datasets per measure (sum over categories or total)
  function buildAggregatedData(measureName: string) {
    // If backend already returns aggregated rows per category (or a single total row),
    // we avoid re-aggregating to prevent double counting.
    if (!hasCategories) {
      // Expect a single aggregated row; if multiple exist, sum defensively.
      if (data.length <= 1) {
        const v = data[0]?.[measureName] ?? 0;
        return [{ [measureName]: typeof v === 'number' ? v : 0 }];
      }
      const total = data
        .map((r: any) => r?.[measureName])
        .filter((v: any) => typeof v === 'number' && isFinite(v))
        .reduce((a: number, b: number) => a + b, 0);
      return [{ [measureName]: total }];
    }
    // Map existing aggregated rows, attaching synthetic composite category column.
    return data.map(row => ({
      [measureName]: row[measureName],
      [categoryColumn!]: (categoryAccessor as any)(row)
    }));
  }

  const measures = layoutType === 'horizontal' ? xMeasures : yMeasures;

  // Dynamic band padding across all measures (same padding for consistency)
  const dynamicBandPadding = computeBandPaddingFromSizeField(data, sizeField, {
    manualSize,
  }) ?? undefined;

  const plots = measures.map((measure, idx) => {
    const measureName = resolveMeasureAlias(measure as any);
    const aggregated = buildAggregatedData(measureName);
  const legacyPadding = hasCategories ? 0.1 : 0.25;
  const bandPadding = dynamicBandPadding !== undefined ? dynamicBandPadding : legacyPadding;
    const options = buildBarOptions({
      data: aggregated,
      measureName,
      orientation: layoutType === 'horizontal' ? 'horizontal' : 'vertical',
      categoryColumn,
      categoriesDomain: categories,
      bandPadding,
      valueDomainOverride: sharedDomains[measureName],
      // Multi-measure small multiples historically used 2 * BAR_STEP for single bar height/width
      singleBarSizeMultiplier: 2,
      tooltipColumns: []
    });
    return {
      id: `${layoutType === 'horizontal' ? 'x' : 'y'}-measure-${idx}`,
      title: measureName,
      options,
      position: layoutType === 'horizontal' ? { row: 0, col: idx } : { row: idx, col: 0 }
    };
  });

  // Layout sizing replicates previous logic
  const intrinsicSize = hasCategories && categories ? Math.max(BAR_STEP_PX, categories.length * BAR_STEP_PX) : BAR_STEP_PX;
  const columnSizes = layoutType === 'horizontal'
    ? Array.from({ length: plots.length }, () => 'fr' as const)
    : [intrinsicSize];
  const rowSizes = layoutType === 'horizontal'
    ? [intrinsicSize]
    : Array.from({ length: plots.length }, () => 'fr' as const);

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
