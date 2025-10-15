import * as Plot from '@observablehq/plot';
import { getResultColumnName } from '../../utils/fieldUtils';
import { ColorScaleInfo } from '../utils/colorSchemeUtils';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING } from '../../config/chartLayoutConfig';
import { Field } from '../../types';

export type Orientation = 'vertical' | 'horizontal';

interface ComputeDomainOpts {
  zeroBaseline?: boolean; // force start at 0
  padRatio?: number;      // headroom ratio, default 0.05
}

export interface BarBuildParams {
  data: any[];
  measureName: string;          // alias in data
  orientation: Orientation;
  categoryColumn?: string;      // undefined => single bar
  categoriesDomain?: string[];  // consistent ordering if provided
  colorColumn?: string;
  colorScale?: ColorScaleInfo | null;
  bandPadding?: number;         // override band padding
  zeroBaseline?: boolean;
  valueDomainOverride?: [number, number];
  tooltipColumns?: string[];    // additional raw columns to show in tooltip
  singleBarSizeMultiplier?: number; // factor for single bar intrinsic size (legacy 5)
}

export const ORIENTATION = {
  vertical: {
    measure: 'y' as const,
    category: 'x' as const,
    bar: Plot.barY,
    rule: Plot.ruleY,
    pointer: 'y' as const,
    sizeProp: 'width' as const
  },
  horizontal: {
    measure: 'x' as const,
    category: 'y' as const,
    bar: Plot.barX,
    rule: Plot.ruleX,
    pointer: 'x' as const,
    sizeProp: 'height' as const
  }
} as const;

// ---------- Domain & Extent -------------------------------------------------
function numericExtent(rows: any[], col: string): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const r of rows) {
    const v = r[col];
    if (typeof v === 'number' && isFinite(v)) {
      if (v < min) min = v; if (v > max) max = v;
    }
  }
  if (min === Infinity) return [0, 0];
  return [min, max];
}

export function computeValueDomain(rows: any[], measureName: string, opts: ComputeDomainOpts = {}): [number, number] {
  const { zeroBaseline = true, padRatio = 0.05 } = opts;
  const [minVal, maxVal] = numericExtent(rows, measureName);
  if (minVal === 0 && maxVal === 0) return [0, 1];
  if (zeroBaseline) {
    const upperRaw = Math.max(0, maxVal);
    const upper = upperRaw === 0 ? 1 : upperRaw * (1 + padRatio);
    return [0, upper];
  }
  // auto domain including negatives
  let lower = minVal;
  let upper = maxVal;
  if (lower === upper) {
    if (lower === 0) return [0, 1];
    return [lower * 0.95, upper * 1.05];
  }
  const spanPad = (upper - lower) * padRatio;
  return [lower - spanPad, upper + spanPad];
}

// ---------- Band Padding (Size Field Mapping) -------------------------------
export interface BandPaddingOptions {
  stat?: 'median' | 'mean';
  minPadding?: number; // thickest
  maxPadding?: number; // thinnest
  defaultPadding?: number;
  manualSize?: number; // User-defined manual size (used when no size field, 1-50 range)
}

/**
 * Get the actual value range of a size field from the data.
 * Returns [min, max] of the aggregated size field values, or undefined if no valid values.
 */
export function getSizeFieldValueRange(rows: any[], sizeField?: Field): [number, number] | undefined {
  if (!sizeField || rows.length === 0) return undefined;
  
  const col = getResultColumnName({ ...sizeField, aggregation: sizeField.aggregation || 'sum' } as any);
  const values = rows.map(r => r[col]).filter(v => typeof v === 'number' && isFinite(v)) as number[];
  
  if (values.length === 0) return undefined;
  
  values.sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  
  // If all values are the same, return a small range to avoid slider issues
  if (min === max) {
    if (min === 0) return [0, 1];
    const padding = Math.abs(min) * 0.1; // 10% padding
    return [min - padding, min + padding];
  }
  
  return [min, max];
}

export function computeBandPaddingFromSizeField(rows: any[], sizeField?: Field, opts: BandPaddingOptions = {}): number | undefined {
  const { stat = 'median', minPadding = 0, maxPadding = 0.95, defaultPadding = BAND_PADDING, manualSize } = opts;
  
  // If no size field, use manualSize to determine band padding
  if (!sizeField) {
    if (manualSize !== undefined) {
      // manualSize is in 1-50 range, normalize to 0..1
      const sizeNorm = (manualSize - 1) / (50 - 1); // 0..1
      // Larger size → smaller padding (thicker bars)
      const padding = maxPadding - (maxPadding - minPadding) * sizeNorm;
      return Math.max(minPadding, Math.min(maxPadding, padding));
    }
    return undefined;
  }
  
  // With size field: compute band padding based on field value statistics
  const col = getResultColumnName({ ...sizeField, aggregation: sizeField.aggregation || 'sum' } as any);
  const values = rows.map(r => r[col]).filter(v => typeof v === 'number' && isFinite(v)) as number[];
  if (values.length === 0) return defaultPadding;
  values.sort((a,b)=>a-b);
  const dataMin = values[0];
  const dataMax = values[values.length - 1];
  
  if (dataMin === dataMax) {
    // All values are the same - use middle of range
    return defaultPadding;
  }
  
  // Compute the representative metric value (median or mean)
  const metric = stat === 'mean' ? (values.reduce((a,b)=>a+b,0)/values.length) : (values[Math.floor(values.length/2)]);
  
  // Normalize metric within data range
  const norm = (metric - dataMin) / (dataMax - dataMin); // 0..1
  
  // Larger normalized value → smaller padding (thicker bars)
  const padding = maxPadding - (maxPadding - minPadding) * norm;
  return Math.max(minPadding, Math.min(maxPadding, padding));
}

// ---------- Categories & Aggregation ---------------------------------------
export function deriveCategories(data: any[], categoryColumn?: string): string[] {
  if (!categoryColumn) return [' '];
  return Array.from(new Set(data.map(r => r[categoryColumn])));
}

export function aggregateByCategory(data: any[], categoryColumn: string, measureName: string): Array<{ cat: string; value: number }> {
  const totals = new Map<string, number>();
  for (const r of data) {
    const cat = r[categoryColumn];
    const v = r[measureName];
    if (typeof v === 'number' && isFinite(v)) {
      totals.set(cat, (totals.get(cat) || 0) + v);
    }
  }
  return Array.from(totals.entries()).map(([cat, value]) => ({ cat, value }));
}

// ---------- Builder ---------------------------------------------------------
export function buildBarOptions(params: BarBuildParams): Plot.PlotOptions {
  const {
    data,
    measureName,
    orientation,
    categoryColumn,
    categoriesDomain,
    colorColumn,
    colorScale,
    bandPadding = BAND_PADDING,
    zeroBaseline = true,
    valueDomainOverride,
    tooltipColumns = [],
    singleBarSizeMultiplier = 1,
  } = params;

  const O = ORIENTATION[orientation];
  const categories = categoriesDomain || deriveCategories(data, categoryColumn);
  const isSingle = categories.length === 1;
  const size = isSingle ? BAR_STEP_PX * singleBarSizeMultiplier : categories.length * BAR_STEP_PX;

  const domain = valueDomainOverride || computeValueDomain(data, measureName, { zeroBaseline });

  // Tooltip format: include specified raw columns (color/size) but not fill legend duplication
  const tipFormat: any = { fill: false };
  tooltipColumns.forEach(c => tipFormat[c] = true);

  const fillValue = colorColumn
    ? (colorScale && colorScale.kind === 'continuous' && colorScale.accessor
        ? (d: any) => colorScale.accessor?.(d) ?? null
        : colorColumn)
    : DEFAULT_CHART_COLOR;

  const baseConfig: any = {
    [O.measure]: measureName,
    fill: fillValue,
    [O.category]: categoryColumn ? categoryColumn : () => categories[0],
    tip: { pointer: O.pointer, preferredAnchor: 'top-right', format: tipFormat }
  };

  // When there's no category but there is color, enable stacking with z channel
  if (!categoryColumn && colorColumn) {
    baseConfig.z = colorColumn;
    baseConfig.order = colorColumn;
  }

  const barMark = O.bar(data, baseConfig);

  const axisCategory = {
    label: categoryColumn || ' ',
    domain: categories as any,
    type: 'band' as any,
    padding: bandPadding as any,
  };
  const axisMeasure = {
    label: measureName,
    grid: true,
    domain: domain as any,
    nice: false
  } as any;

  const plot: Plot.PlotOptions = {
    marks: [barMark],
    [O.sizeProp]: size,
    [O.category]: axisCategory,
    [O.measure]: axisMeasure,
  } as any;

  if (colorColumn && colorScale) {
    const colorConfig = colorScale.kind === 'continuous'
      ? {
          type: 'linear',
          domain: colorScale.domain as [number, number],
          range: colorScale.range,
          clamp: true,
        }
      : {
          type: 'ordinal' as any,
          domain: colorScale.domain as any[],
          range: colorScale.range,
        };

    (plot as any).color = {
      ...(plot as any).color,
      ...colorConfig,
      label: colorColumn,
    } as any;
  }

  return plot;
}

// ---------- Convenience to prepare measure alias ---------------------------
export function resolveMeasureAlias(field: Field): string {
  const agg = field.aggregation || 'sum';
  return getResultColumnName({ ...field, aggregation: agg } as any);
}
