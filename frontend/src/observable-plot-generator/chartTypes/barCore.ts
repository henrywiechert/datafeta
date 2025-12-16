import * as Plot from '@observablehq/plot';
import { getResultColumnName } from '../../utils/fieldUtils';
import { ColorScaleInfo } from '../utils/colorSchemeUtils';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';

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
  tooltipFields?: Field[];    // additional fields to show in tooltip
  /**
   * Optional manual color used when there is no color field.
   * When provided and no colorColumn is set, bars will use this as their fill.
   */
  manualColor?: string;
}

export const ORIENTATION = {
  vertical: {
    measure: 'y' as const,
    category: 'x' as const,
    bar: Plot.barY,
    rule: Plot.ruleY,
    pointer: 'xy' as const,
    sizeProp: 'width' as const
  },
  horizontal: {
    measure: 'x' as const,
    category: 'y' as const,
    bar: Plot.barX,
    rule: Plot.ruleX,
    pointer: 'xy' as const,
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
    // Negative-only data: let bars extend below 0 with the upper clamped at 0
    if (maxVal <= 0) {
      // Optional small padding below min to prevent bar touching axis if span > 0
      if (minVal < maxVal) {
        const span = Math.abs(maxVal - minVal);
        const pad = span * padRatio;
        return [minVal - pad, 0];
      }
      return [minVal, 0];
    }
    // Positive-only data: clamp lower at 0 and pad upper
    if (minVal >= 0) {
      const upper = maxVal * (1 + padRatio);
      return [0, upper];
    }
    // Mixed negative & positive: include full span with padding both sides, keeping 0 inside domain
    const span = maxVal - minVal;
    const pad = span * padRatio;
    return [minVal - pad, maxVal + pad];
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

/**
 * Sorts categories by their aggregated values.
 * @param categories - Array of category values
 * @param data - Dataset with category and measure columns
 * @param categoryColumn - Column name for categories
 * @param measureName - Column name for measure values
 * @param sortOrder - 'asc' for ascending, 'desc' for descending, 'none' for natural order
 * @returns Sorted array of categories
 */
export function sortCategoriesByValue(
  categories: string[],
  data: any[],
  categoryColumn: string,
  measureName: string,
  sortOrder: 'asc' | 'desc' | 'none' | undefined
): string[] {
  if (!sortOrder || sortOrder === 'none') {
    return categories;
  }

  // Aggregate values by category
  const aggregated = aggregateByCategory(data, categoryColumn, measureName);
  const valueMap = new Map(aggregated.map(item => [item.cat, item.value]));

  // Sort categories by their values
  const sorted = [...categories].sort((a, b) => {
    const valA = valueMap.get(a) ?? 0;
    const valB = valueMap.get(b) ?? 0;
    const diff = valA - valB;
    return sortOrder === 'asc' ? diff : -diff;
  });

  return sorted;
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
    tooltipFields = [],
    manualColor,
  } = params;

  const O = ORIENTATION[orientation];
  const categories = categoriesDomain || deriveCategories(data, categoryColumn);
  const size = categories.length * BAR_STEP_PX;

  // Compute domain, accounting for stacking when there's no category but there is color
  let domain: [number, number];
  if (valueDomainOverride) {
    domain = valueDomainOverride;
  } else if (!categoryColumn && colorColumn) {
    // Stacked bar: domain should be the sum of all segments
    const values = data
      .map(r => r[measureName])
      .filter(v => typeof v === 'number' && isFinite(v));
    const total = values.reduce((sum, v) => sum + v, 0);
    if (total === 0) {
      domain = [0, 1];
    } else if (total > 0) {
      const upper = total * (1 + (zeroBaseline ? 0.05 : 0));
      domain = [0, upper];
    } else { // total < 0 (all segments negative)
      const lower = total * (1 + (zeroBaseline ? 0.05 : 0)); // extend magnitude slightly
      domain = [lower, 0];
    }
  } else {
    // Regular bar: use individual values
    domain = computeValueDomain(data, measureName, { zeroBaseline });
  }

  const fillValue = colorColumn
    ? (colorScale && colorScale.kind === 'continuous' && colorScale.accessor
        ? (d: any) => colorScale.accessor?.(d) ?? null
        : colorColumn)
    : (manualColor || DEFAULT_CHART_COLOR);

  // Build channels for tooltip - only include what we want to show
  const channels: any = {};
  
  // Add measure to channels with its label
  channels[measureName] = { value: measureName, label: measureName };
  
  // Add category to channels if present
  if (categoryColumn) {
    channels[categoryColumn] = { value: categoryColumn, label: categoryColumn };
  }
  
  // Add color field to channels when present (avoid duplicate)
  if (colorColumn && !channels[colorColumn]) {
    channels[colorColumn] = { value: colorColumn, label: colorColumn };
  }

  // Tooltip format: explicitly list what to show and hide everything else
  const tipFormat: any = {};
  
  // Enable all our custom channels
  Object.keys(channels).forEach(key => {
    tipFormat[key] = true;
  });
  
  // Disable built-in Observable Plot tooltip (we'll use custom tooltips)
  // Don't set title and tip on baseConfig

  const baseConfig: any = {
    [O.measure]: measureName,
    fill: fillValue,
    [O.category]: categoryColumn ? categoryColumn : () => categories[0],
    channels: channels
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
    grid: false,  // Disable grid on category axis to prevent shifting with padding changes
    // Don't set explicit range - let Observable Plot compute it naturally
    // The suppressAxes function ensures margins are 0, so bands will fill available space
  };
  const axisMeasure = {
    label: measureName,
    grid: true,  // Keep grid on measure axis (stable, won't shift with band padding)
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

  // Add custom tooltip configuration
  const mainFields: { label: string; column: string }[] = [
    { label: measureName, column: measureName }
  ];
  
  if (categoryColumn) {
    mainFields.push({ label: categoryColumn, column: categoryColumn });
  }
  
  // Pass tooltipFields directly to createTooltipFieldsGetter
  (plot as any).__customTooltip = {
    enabled: true,
    data: data, // Pass the data array for tooltip access
    getFields: createTooltipFieldsGetter(
      mainFields,
      colorColumn && colorColumn !== categoryColumn && colorColumn !== measureName
        ? { columnName: colorColumn, type: 'dimension' } as Field
        : undefined,
      undefined, // No size field in bar charts
      tooltipFields.length > 0 ? tooltipFields : undefined
    ),
    getColor: (() => {
      if (colorColumn && colorScale) {
        if (colorScale.kind === 'categorical') {
          const domain = colorScale.domain as any[];
          const range = colorScale.range;
          return (d: any) => {
            const val = d[colorColumn];
            const key = val instanceof Date ? val.valueOf() : val;
            const idx = domain.findIndex(v => (v instanceof Date ? v.valueOf() : v) === key);
            const i = idx >= 0 ? idx : 0;
            return range[i % range.length];
          };
        } else {
          const [min, max] = colorScale.domain as [number, number];
          const range = colorScale.range;
          const accessor = colorScale.accessor;
          const tOf = (d: any) => {
            const raw = accessor ? accessor(d) : (d[colorColumn] as number);
            if (raw == null || !isFinite(raw as number)) return undefined;
            if (max === min) return 0;
            const t = ((raw as number) - min) / (max - min);
            return Math.max(0, Math.min(1, t));
          };
          return (d: any) => {
            const t = tOf(d);
            if (t === undefined) return undefined;
            const idx = Math.round(t * (range.length - 1));
            return range[Math.max(0, Math.min(range.length - 1, idx))];
          };
        }
      }
      if (manualColor) {
        return () => manualColor!;
      }
      return undefined;
    })()
  };

  return plot;
}

// ---------- Convenience to prepare measure alias ---------------------------
export function resolveMeasureAlias(field: Field): string {
  const agg = field.aggregation || 'sum';
  return getResultColumnName({ ...field, aggregation: agg } as any);
}
