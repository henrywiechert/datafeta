/**
 * Multi-mark chart generator for MeasureValues with per-measure chart type overrides.
 * 
 * When MeasureValues is used and source measures have different chart type overrides,
 * this generates a single plot with multiple mark layers - one per measure - where
 * each measure can use a different mark type (line, scatter, bar, etc.).
 */

import * as Plot from '@observablehq/plot';
import { Field, FieldOverrideState, UserChartType } from '../../types';
import { MEASURE_NAMES_FIELD } from '../../utils/syntheticFields';
import { getResultColumnName } from '../../utils/fieldUtils';
import { ColorScaleInfo } from '../utils/colorSchemeUtils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';

/**
 * Check if source measures have any per-measure overrides that require multi-mark rendering.
 * Returns true if at least one measure has a chart type, size, or color override.
 */
export function hasAnyMeasureOverrides(
  measureValuesSourceFields: Field[] | undefined,
  fieldOverrides: Record<string, FieldOverrideState> | undefined
): boolean {
  if (!measureValuesSourceFields?.length || !fieldOverrides) {
    return false;
  }

  for (const sourceField of measureValuesSourceFields) {
    const override = fieldOverrides[sourceField.id];
    if (override) {
      // Check for any override that affects rendering
      if (override.chartType !== undefined ||
          override.manualSize !== undefined ||
          override.manualColor !== undefined ||
          override.sizeRange !== undefined) {
        return true;
      }
    }
  }

  return false;
}


/**
 * Get the chart type for a specific measure, falling back to default.
 */
function getMeasureChartType(
  measureField: Field,
  fieldOverrides: Record<string, FieldOverrideState> | undefined,
  defaultChartType: UserChartType = 'line'
): UserChartType {
  const override = fieldOverrides?.[measureField.id];
  return override?.chartType || defaultChartType;
}

/**
 * Get the size for a specific measure from overrides.
 */
function getMeasureSize(
  measureField: Field,
  fieldOverrides: Record<string, FieldOverrideState> | undefined,
  defaultSize: number = 4
): number {
  const override = fieldOverrides?.[measureField.id];
  return override?.manualSize ?? defaultSize;
}

interface MultiMarkConfig {
  data: any[];
  xField: Field;
  yField: Field;
  measureValuesSourceFields: Field[];
  fieldOverrides: Record<string, FieldOverrideState>;
  colorField?: Field;
  colorScheme?: string;
  sharedColorScale?: ColorScaleInfo | null;
  manualSize?: number;
  manualColor?: string;
  sharedDomains?: Record<string, [number, number] | [Date, Date]>;
  tooltipFields?: Field[];
}

/**
 * Create marks for a specific chart type.
 * Returns an array of marks (some chart types need multiple marks, e.g., line + dots).
 * 
 * IMPORTANT: staticColor should be an actual color value (e.g., "#4e79a7"), not a column name.
 * This ensures each mark is completely independent with its own size/color settings.
 */
function createMarksForType(
  chartType: UserChartType,
  filteredData: any[],
  xColumn: string,
  yColumn: string,
  staticColor: string,  // Actual color value, NOT a column name
  sizeValue: number,
  orientation: 'vertical' | 'horizontal',
  tooltipChannels?: Record<string, any>
): Plot.Markish[] {
  // ---- Reduction helpers (safety) ------------------------------------------
  // MeasureValues plots can accidentally try to render 100k+ points per mark layer.
  // Observable Plot can stack overflow in those cases. We apply a lightweight reduction for line marks.
  const toComparable = (v: any): number | string | null => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const num = Number.parseFloat(v);
      if (Number.isFinite(num)) return num;
      const ts = Date.parse(v);
      if (!Number.isNaN(ts)) return ts;
      return v;
    }
    return null;
  };

  const sampleEvery = <T,>(arr: T[], maxCount: number): T[] => {
    if (arr.length <= maxCount) return arr;
    const stride = Math.ceil(arr.length / maxCount);
    const out: T[] = [];
    for (let i = 0; i < arr.length; i += stride) out.push(arr[i]);
    if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
    return out;
  };

  // M4-ish reduction: preserve first/last and per-bucket min/max in Y; good spike retention.
  const reduceLine = (rows: any[], maxPoints: number): any[] => {
    if (rows.length <= maxPoints) return rows;
    const sorted = rows.slice().sort((a, b) => {
      const ax = toComparable(a[xColumn]);
      const bx = toComparable(b[xColumn]);
      if (ax == null && bx == null) return 0;
      if (ax == null) return 1;
      if (bx == null) return -1;
      if (typeof ax === 'string' || typeof bx === 'string') return String(ax).localeCompare(String(bx));
      return (ax as number) - (bx as number);
    });
    const n = sorted.length;
    const keep = new Set<number>();
    keep.add(0);
    keep.add(n - 1);
    // Buckets contribute up to 2 points each.
    const bucketCount = Math.max(1, Math.floor((maxPoints - keep.size) / 2));
    const bucketSize = n / bucketCount;
    for (let b = 0; b < bucketCount; b++) {
      const start = Math.floor(b * bucketSize);
      const end = Math.min(n, Math.floor((b + 1) * bucketSize));
      if (end <= start) continue;
      let bMin = Infinity, bMax = -Infinity, iMin = start, iMax = start;
      for (let i = start; i < end; i++) {
        const y = sorted[i]?.[yColumn];
        if (typeof y !== 'number' || !Number.isFinite(y)) continue;
        if (y < bMin) { bMin = y; iMin = i; }
        if (y > bMax) { bMax = y; iMax = i; }
      }
      keep.add(iMin);
      keep.add(iMax);
    }
    const idx = Array.from(keep).sort((i, j) => i - j);
    const picked = idx.map(i => sorted[i]);
    return picked.length > maxPoints ? sampleEvery(picked, maxPoints) : picked;
  };

  const LINE_MAX_POINTS = 10_000;
  const DOT_MAX_POINTS = 8_000;

  // Common options (no tip - we use custom tooltips)
  const baseOptions: any = {
    x: xColumn,
    y: yColumn,
  };

  // Add tooltip channels for hover interaction
  if (tooltipChannels) {
    baseOptions.channels = tooltipChannels;
  }

  switch (chartType) {
    case 'line': {
      // Reduce points for line safety; cap dots even further.
      const lineData = reduceLine(filteredData, LINE_MAX_POINTS);
      const dotData = sampleEvery(lineData, DOT_MAX_POINTS);

      // Line chart with visible dots
      // Using static color values (not column references) ensures independent strokeWidth per mark
      const lineConfig: any = {
        ...baseOptions,
        stroke: staticColor,
        strokeWidth: sizeValue,
      };
      const dotConfig: any = {
        ...baseOptions,
        fill: staticColor,
        r: Math.max(2, sizeValue / 2), // Dot size proportional to line width
        channels: tooltipChannels,
      };
      // Invisible hover dots for better tooltip detection
      const hoverDotConfig: any = {
        x: xColumn,
        y: yColumn,
        r: 6,
        fill: 'transparent',
        stroke: 'transparent',
        strokeWidth: 0,
      };
      return [
        Plot.line(lineData, lineConfig),
        Plot.dot(dotData, dotConfig),
        Plot.dot(dotData, hoverDotConfig),
      ];
    }

    case 'tick':
      if (orientation === 'vertical') {
        return [Plot.tickY(filteredData, {
          ...baseOptions,
          stroke: staticColor,
          strokeWidth: sizeValue,
        })];
      } else {
        return [Plot.tickX(filteredData, {
          x: yColumn,
          y: xColumn,
          stroke: staticColor,
          strokeWidth: sizeValue,
          channels: tooltipChannels,
        })];
      }

    case 'bar':
      if (orientation === 'vertical') {
        return [Plot.barY(filteredData, {
          ...baseOptions,
          fill: staticColor,
        })];
      } else {
        return [Plot.barX(filteredData, {
          x: yColumn,
          y: xColumn,
          fill: staticColor,
          channels: tooltipChannels,
        })];
      }

    case 'scatter':
    default:
      return [Plot.dot(filteredData, {
        ...baseOptions,
        fill: staticColor,
        r: sizeValue,
      })];
  }
}

/**
 * Generate a multi-mark plot for MeasureValues with per-measure chart types.
 * Each source measure is rendered as a separate mark layer with its own chart type.
 */
// Default color palette when no color scale is available
const DEFAULT_COLORS = [
  '#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f',
  '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'
];

export function generateMeasureValuesMultiMarkPlot(config: MultiMarkConfig): Plot.PlotOptions {
  const {
    data,
    xField,
    yField,
    measureValuesSourceFields,
    fieldOverrides,
    colorField,
    sharedColorScale,
    sharedDomains,
    manualSize = 4,
    manualColor,
    tooltipFields,
  } = config;

  // Determine which field is MeasureValues and which is the category/x-axis
  const isMeasureValuesOnY = yField.syntheticType === 'MeasureValues';
  const measureValuesField = isMeasureValuesOnY ? yField : xField;
  
  // Get the actual column name in the data (handles aggregation aliases)
  const measureValuesColumn = getResultColumnName(measureValuesField);
  const measureNamesColumn = MEASURE_NAMES_FIELD;
  
  // The other axis field
  const categoryField = isMeasureValuesOnY ? xField : yField;
  const categoryColumn = getResultColumnName(categoryField);
  
  const orientation: 'vertical' | 'horizontal' = isMeasureValuesOnY ? 'vertical' : 'horizontal';

  // Build tooltip channels from tooltipFields if provided
  let tooltipChannels: Record<string, any> | undefined;
  if (tooltipFields && tooltipFields.length > 0) {
    tooltipChannels = {};
    for (const field of tooltipFields) {
      const colName = getResultColumnName(field);
      tooltipChannels[field.columnName] = { value: colName, label: field.columnName };
    }
  }

  // Build a color lookup: measureName -> actual color value
  // This ensures each mark uses a static color, making strokeWidth/size truly independent per mark
  const colorLookup: Record<string, string> = {};
  if (sharedColorScale && sharedColorScale.kind === 'categorical') {
    // Use the color scale to map measure names to colors
    const domain = sharedColorScale.domain as string[];
    const range = sharedColorScale.range as string[];
    for (let i = 0; i < domain.length; i++) {
      colorLookup[domain[i]] = range[i % range.length];
    }
  } else {
    // Fallback: assign colors from default palette
    for (let i = 0; i < measureValuesSourceFields.length; i++) {
      colorLookup[measureValuesSourceFields[i].columnName] = DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    }
  }

  // Create marks for each source measure
  const allMarks: Plot.Markish[] = [];

  for (let i = 0; i < measureValuesSourceFields.length; i++) {
    const measureField = measureValuesSourceFields[i];
    const measureName = measureField.columnName;
    
    // Filter data to only rows for this measure
    const filteredData = data.filter(row => row[measureNamesColumn] === measureName);
    
    if (filteredData.length === 0) continue;

    // Get chart type for this measure
    const chartType = getMeasureChartType(measureField, fieldOverrides, 'line');
    
    // Get size for this measure (from per-field override or global fallback)
    const sizeValue = getMeasureSize(measureField, fieldOverrides, manualSize);

    // Get the actual color value for this measure
    // Priority: per-field override > color scale lookup > manualColor > default
    const override = fieldOverrides[measureField.id];
    const staticColor = override?.manualColor 
      || colorLookup[measureName] 
      || manualColor 
      || DEFAULT_COLORS[i % DEFAULT_COLORS.length];

    // Create the marks for this measure (may be multiple, e.g., line + dots)
    const marks = createMarksForType(
      chartType,
      filteredData,
      isMeasureValuesOnY ? categoryColumn : measureValuesColumn,
      isMeasureValuesOnY ? measureValuesColumn : categoryColumn,
      staticColor,
      sizeValue,
      orientation,
      tooltipChannels
    );

    allMarks.push(...marks);
  }

  // Add a baseline rule at y=0
  allMarks.push(Plot.ruleY([0], { stroke: '#ddd', strokeWidth: 1 }));

  // Build axis configurations
  // Explicitly set type to ensure proper scaling for mixed chart types
  // Use consistent settings to avoid different padding between chart types
  const xAxisConfig: any = {
    label: categoryField.columnName,
    grid: true,
    type: 'linear',  // Force linear scale for numeric X axis
  };
  
  const yAxisConfig: any = {
    label: measureValuesField.columnName,
    grid: true,
    type: 'linear',  // Force linear scale for numeric Y axis
    // Don't use 'nice' - we'll set the domain explicitly from sharedDomains
    // This ensures all mark types use the exact same scale
  };

  // Apply shared domains if available
  if (sharedDomains) {
    // Set measure (value) axis domain
    const measureDomain = sharedDomains[measureValuesColumn];
    if (measureDomain) {
      if (isMeasureValuesOnY) {
        yAxisConfig.domain = measureDomain;
      } else {
        xAxisConfig.domain = measureDomain;
      }
    }
    
    // Set category axis domain (important for scatter plots)
    const categoryDomain = sharedDomains[categoryColumn];
    if (categoryDomain) {
      if (isMeasureValuesOnY) {
        xAxisConfig.domain = categoryDomain;
      } else {
        yAxisConfig.domain = categoryDomain;
      }
    }
  }

  // Build the plot options
  const plotOptions: Plot.PlotOptions = {
    x: xAxisConfig,
    y: yAxisConfig,
    marks: allMarks,
  };

  // Apply the shared color scale if available (from the parent context)
  // This uses the same color configuration as the rest of the chart system
  // Note: legend is NOT set here - it comes from the parent coordinator
  if (sharedColorScale) {
    const colorConfig = sharedColorScale.kind === 'continuous'
      ? {
          type: 'linear' as const,
          domain: sharedColorScale.domain as [number, number],
          range: sharedColorScale.range,
          clamp: true,
        }
      : {
          type: 'ordinal' as const,
          domain: sharedColorScale.domain as any[],
          range: sharedColorScale.range,
        };
    
    (plotOptions as any).color = {
      ...colorConfig,
      label: colorField?.columnName,
    };
  }

  // Add custom tooltip configuration (same system as other chart types)
  const xLabel = categoryField.columnName;
  const yLabel = measureValuesField.columnName;
  (plotOptions as any).__customTooltip = {
    enabled: true,
    data: data,
    getFields: createTooltipFieldsGetter(
      [
        { label: xLabel, column: categoryColumn },
        { label: yLabel, column: measureValuesColumn }
      ],
      colorField,
      undefined, // sizeField not applicable here
      tooltipFields
    )
  };

  return plotOptions;
}
