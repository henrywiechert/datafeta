import { ChartGenerationContext, PlotResult } from '../types';
import { getFieldColumnName } from '../helpers/fields';
import { resolveMeasureAlias, buildBarOptions, computeBandPaddingFromSizeField } from './barCore';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { getResultColumnName } from '../../utils/fieldUtils';
import { BAR_STEP_PX, BAND_PADDING } from '../../config/chartLayoutConfig';

/**
 * Unified bar chart builder for 1+ measures on a single axis.
 * - Single measure → returns single Plot options
 * - Multiple measures → returns grid of small-multiple bar charts
 *
 * Harmonizes:
 * - Category derivation (composite categories across all opposite-axis discrete dimensions)
 * - Band padding computed from size field or manual size (same fallback for all)
 * - Value domains shared across measures
 * - Single-bar intrinsic sizing multiplier kept consistent
 */
export function barUnified(context: ChartGenerationContext): PlotResult {
  const { queryResult, xFields, yFields, colorField, colorScheme, sizeField, manualSize } = context;
  const data = queryResult.rows;

  // Determine orientation and measure set
  const yMeasures = yFields.filter(f => f.type === 'measure');
  const xMeasures = xFields.filter(f => f.type === 'measure');
  if (yMeasures.length === 0 && xMeasures.length === 0) {
    throw new Error('Bar chart requires at least one measure.');
  }

  const orientation: 'vertical' | 'horizontal' = yMeasures.length > 0 ? 'vertical' : 'horizontal';
  const measures = orientation === 'vertical' ? yMeasures : xMeasures;

  // Category dimensions strategy: use opposite-axis discrete dims; fallback to same-axis dims if none
  const oppDims = orientation === 'vertical'
    ? xFields.filter(f => f.type === 'dimension')
    : yFields.filter(f => f.type === 'dimension');
  const sameDims = orientation === 'vertical'
    ? yFields.filter(f => f.type === 'dimension')
    : xFields.filter(f => f.type === 'dimension');
  const categoryDims = oppDims.length > 0 ? oppDims : sameDims;

  const hasCategories = categoryDims.length > 0;
  const categoryAccessor = hasCategories
    ? (row: any) => categoryDims.map((d: any) => row[getFieldColumnName(d)]).join(' • ')
    : undefined;
  const categories = hasCategories
    ? Array.from(new Set(data.map(categoryAccessor as any))) as string[]
    : undefined;
  const categoryColumn = hasCategories ? '__category' : undefined;

  // Color mapping (consistent with single-measure bar)
  const colorColumn = colorField ? getResultColumnName(colorField) : undefined;
  const colorScale = colorField ? deriveColorScaleInfo(data, colorField, colorScheme) : null;

  // Dynamic band padding with consistent fallback for all cases
  const bandPadding = computeBandPaddingFromSizeField(data, sizeField, { manualSize }) ?? BAND_PADDING;

  // Shared value domains across measures for consistent scaling
  const sharedDomains = calculateSharedDomains(measures as any[], data);

  const plots = measures.map((measure, idx) => {
    const measureName = resolveMeasureAlias(measure as any);

    // Build aggregated dataset mapping composite category when present
    const aggregated = categoryColumn
      ? data.map(row => ({ [measureName]: row[measureName], [categoryColumn]: (categoryAccessor as any)(row), ...(colorColumn ? { [colorColumn]: (row as any)[colorColumn] } : {}) }))
      : (
          // When no categories but we do have a color column, keep per-row data for stacking by color.
          colorColumn
            ? data
            : buildTotalOnlyData(data, measureName)
        );

    const useStackedDomain = !categoryColumn && !!colorColumn;
    const options = buildBarOptions({
      data: aggregated,
      measureName,
      orientation,
      categoryColumn,
      categoriesDomain: categories,
      colorColumn,
      colorScale,
      bandPadding,
      valueDomainOverride: useStackedDomain ? undefined : sharedDomains[measureName],
      // Keep legacy visual sizing multiplier for a single bar
      singleBarSizeMultiplier: 2,
      tooltipColumns: [colorField?.columnName, sizeField?.columnName].filter(Boolean) as string[],
    });

    return {
      id: `${orientation === 'vertical' ? 'y' : 'x'}-measure-${idx}`,
      title: measureName,
      options,
      position: orientation === 'vertical' ? { row: idx, col: 0 } : { row: 0, col: idx }
    };
  });

  // Always return a grid-style PlotResult (even for a single plot) so that
  // the renderer uses the unified left-side label/axis layout.
  const intrinsicSize = hasCategories && categories ? Math.max(BAR_STEP_PX, categories.length * BAR_STEP_PX) : BAR_STEP_PX;
  const columnSizes = orientation === 'horizontal'
    ? Array.from({ length: plots.length }, () => 'fr' as const)
    : [intrinsicSize];
  const rowSizes = orientation === 'horizontal'
    ? [intrinsicSize]
    : Array.from({ length: plots.length }, () => 'fr' as const);

  return {
    library: 'observable-plot',
    plots,
    sharedDomains,
    layout: {
      type: 'grid',
      columns: orientation === 'horizontal' ? plots.length : 1,
      rows: orientation === 'horizontal' ? 1 : plots.length,
      columnSizes,
      rowSizes,
    },
  };
}

// ---- Helpers (local) -------------------------------------------------------

/**
 * If no categories, either forward a single row or produce a single summed total row.
 */
function buildTotalOnlyData(data: any[], measureName: string) {
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

/**
 * Calculate shared domains across all measures (0..max padded by 5%).
 */
function calculateSharedDomains(measures: any[], data: any[]) {
  const domains: Record<string, [number, number]> = {};
  measures.forEach(measure => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName as any);
    const values = data.map(row => row[measureName]).filter((v: any) => typeof v === 'number' && isFinite(v));
    if (values.length > 0) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const lower = Math.min(0, min);
      const upperRaw = Math.max(0, max);
      const upper = upperRaw === 0 ? 1 : upperRaw * 1.05;
      domains[measureName] = [lower, upper];
    } else {
      domains[measureName] = [0, 1];
    }
  });
  return domains;
}


