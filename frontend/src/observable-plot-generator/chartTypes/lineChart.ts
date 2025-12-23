import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createSizeScale } from '../utils/sizeUtils';
import { createLabelMark, prepareLabelData, LabelRenderConfig } from '../utils/labelUtils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';

type LineBudget = {
  maxPoints: number;
  // Prefer allocating a minimum per series when there is discrete color (multiple lines).
  minPerSeries: number;
  // Dot marks are much heavier than a single path; cap dots separately to avoid stack overflows.
  maxDots: number;
};

function computeLineBudget(hasDiscreteColor: boolean): LineBudget {
  // Lines (and dots) can stack overflow when we render hundreds of thousands of points.
  // Keep this conservative; the goal is visual fidelity, not exact point-for-point rendering.
  return {
    // Keep line points under a conservative cap; dots are capped separately (see maxDots).
    maxPoints: hasDiscreteColor ? 1_000 : 1_000,
    minPerSeries: hasDiscreteColor ? 200 : 0,
    maxDots: hasDiscreteColor ? 1_000 : 1_000,
  };
}

type XKind = 'time' | 'number' | 'other';

function inferXKind(sampleValues: any[]): XKind {
  for (const v of sampleValues) {
    if (v instanceof Date) return 'time';
    if (typeof v === 'number' && Number.isFinite(v)) return 'number';
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) continue;
      // If it's a pure number string, treat as numeric.
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return 'number';
      const ts = Date.parse(t);
      if (!Number.isNaN(ts)) return 'time';
    }
  }
  return 'other';
}

function toXNumber(v: any, kind: XKind): number | null {
  if (kind === 'time') {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'string') {
      const ts = Date.parse(v);
      return Number.isNaN(ts) ? null : ts;
    }
    return null;
  }
  if (kind === 'number') {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const num = Number.parseFloat(v);
      return Number.isFinite(num) ? num : null;
    }
    if (v instanceof Date) return v.getTime();
    return null;
  }
  // other: try best-effort numeric conversion, else null
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const ts = Date.parse(v);
    if (!Number.isNaN(ts)) return ts;
    const num = Number.parseFloat(v);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

/**
 * Bin-aggregate a line series so we end up with ~one point per x "position".
 * This makes line charts readable (unlike scatter) and avoids vertical hairballs when x has many distinct values.
 *
 * For now we keep it simple: average Y per bin. (Min/max envelope is a follow-up.)
 */
function binAggregateLine(
  rowsSorted: any[],
  xColumn: string,
  yColumn: string,
  opts: {
    maxBins: number;
    xKind: XKind;
  }
): any[] {
  const n = rowsSorted.length;
  const { maxBins, xKind } = opts;
  if (n <= maxBins || maxBins <= 0) return rowsSorted;

  // Build numeric x values and global span
  let minX = Infinity;
  let maxX = -Infinity;
  const xs: Array<number | null> = new Array(n);
  for (let i = 0; i < n; i++) {
    const xNum = toXNumber(rowsSorted[i]?.[xColumn], xKind);
    xs[i] = xNum;
    if (xNum == null) continue;
    if (xNum < minX) minX = xNum;
    if (xNum > maxX) maxX = xNum;
  }
  if (minX === Infinity || maxX === -Infinity) {
    // Fallback: uniform stride sample
    const stride = Math.ceil(n / maxBins);
    const out: any[] = [];
    for (let i = 0; i < n; i += stride) out.push(rowsSorted[i]);
    if (out[out.length - 1] !== rowsSorted[n - 1]) out.push(rowsSorted[n - 1]);
    return out;
  }

  const span = maxX - minX;
  if (span === 0) {
    // All x identical -> just average y into a single point.
    let sumY = 0;
    let cnt = 0;
    for (const r of rowsSorted) {
      const y = r?.[yColumn];
      if (typeof y === 'number' && Number.isFinite(y)) {
        sumY += y;
        cnt++;
      }
    }
    const yAvg = cnt ? sumY / cnt : 0;
    const xVal = xKind === 'time' ? new Date(minX) : minX;
    return [{ ...rowsSorted[0], [xColumn]: xVal, [yColumn]: yAvg }];
  }

  const bins = Math.min(maxBins, n);
  const binWidth = span / bins;

  type Acc = { sumX: number; sumY: number; cnt: number };
  const accs: Acc[] = Array.from({ length: bins }, () => ({ sumX: 0, sumY: 0, cnt: 0 }));

  for (let i = 0; i < n; i++) {
    const xNum = xs[i];
    const y = rowsSorted[i]?.[yColumn];
    if (xNum == null) continue;
    if (typeof y !== 'number' || !Number.isFinite(y)) continue;
    let b = Math.floor((xNum - minX) / binWidth);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    const a = accs[b];
    a.sumX += xNum;
    a.sumY += y;
    a.cnt += 1;
  }

  const out: any[] = [];
  for (let b = 0; b < bins; b++) {
    const a = accs[b];
    if (a.cnt === 0) continue;
    const xAvg = a.sumX / a.cnt;
    const yAvg = a.sumY / a.cnt;
    const xVal = xKind === 'time' ? new Date(xAvg) : xAvg;
    out.push({ ...rowsSorted[0], [xColumn]: xVal, [yColumn]: yAvg });
  }

  return out;
}

function sampleEvery<T>(arr: T[], maxCount: number): T[] {
  if (arr.length <= maxCount) return arr;
  const stride = Math.ceil(arr.length / maxCount);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += stride) out.push(arr[i]);
  // ensure last point present (helps hover at end)
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

/**
 * Line chart for continuous dimension on one axis and continuous measure on the other.
 * xColumn/yColumn are data column names in the query result to use.
 */
export function lineChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  labels?: { x?: string; y?: string },
  domain?: { x?: [number, number] | [Date, Date]; y?: [number, number] | [Date, Date] },
  colorField?: Field,
  colorScheme?: string,
  colorBias?: number,
  // Optional manual color used when there is no color field
  manualColor?: string,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number },
  tooltipFields?: Field[]
): Plot.PlotOptions {
  // Filter to finite numeric values for y; x may be numeric or datetime/ordinal
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[yColumn]))
    : [];

  if (clean.length === 0) {
    return {
      x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true } as any,
      y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true } as any,
      marks: [],
    };
  }

  // Ensure the line flows left-to-right by sorting by the X dimension
  const toComparable = (v: any): number | string | null => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const num = Number.parseFloat(v);
      if (Number.isFinite(num)) return num;
      const ts = Date.parse(v);
      if (!Number.isNaN(ts)) return ts;
      return v; // fallback lexical
    }
    return null;
  };
  const cleanSorted = clean.slice().sort((a, b) => {
    const ax = toComparable(a[xColumn]);
    const bx = toComparable(b[xColumn]);
    if (ax == null && bx == null) return 0;
    if (ax == null) return 1;
    if (bx == null) return -1;
    if (typeof ax === 'string' || typeof bx === 'string') return String(ax).localeCompare(String(bx));
    return (ax as number) - (bx as number);
  });

  // ---- Auto bin-aggregation (line-specific) --------------------------------
  // Line charts should read left-to-right with ~one point per x position.
  // For dense x domains, bin + average reduces clutter and removes near-vertical hairballs.
  const _ = colorField ? deriveColorScaleInfo(cleanSorted, colorField, colorScheme, colorBias) : null;
  const hasDiscreteColor = !!colorField && colorField.flavour === 'discrete';
  const budget = computeLineBudget(hasDiscreteColor);
  const xKind: XKind = inferXKind(cleanSorted.slice(0, 25).map(r => r?.[xColumn]));
  const colorColumnNamePre = colorField ? getResultColumnName(colorField) : undefined;

  // Heuristic bin count: align with our previous safety budgets.
  const maxBins = budget.maxPoints;
  let budgetedSorted = cleanSorted;
  if (cleanSorted.length > maxBins) {
    if (hasDiscreteColor && colorColumnNamePre) {
      const groups = new Map<any, any[]>();
      for (const r of cleanSorted) {
        const k = r?.[colorColumnNamePre];
        const arr = groups.get(k) || [];
        arr.push(r);
        groups.set(k, arr);
      }
      const reduced: any[] = [];
      for (const [_k, arr] of Array.from(groups.entries())) {
        const arrSorted = arr.slice().sort((a, b) => {
          const ax = toComparable(a[xColumn]);
          const bx = toComparable(b[xColumn]);
          if (ax == null && bx == null) return 0;
          if (ax == null) return 1;
          if (bx == null) return -1;
          if (typeof ax === 'string' || typeof bx === 'string') return String(ax).localeCompare(String(bx));
          return (ax as number) - (bx as number);
        });
        reduced.push(...binAggregateLine(arrSorted, xColumn, yColumn, { maxBins, xKind }));
      }
      budgetedSorted = reduced.slice().sort((a, b) => {
        const ax = toComparable(a[xColumn]);
        const bx = toComparable(b[xColumn]);
        if (ax == null && bx == null) return 0;
        if (ax == null) return 1;
        if (bx == null) return -1;
        if (typeof ax === 'string' || typeof bx === 'string') return String(ax).localeCompare(String(bx));
        return (ax as number) - (bx as number);
      });
    } else {
      budgetedSorted = binAggregateLine(cleanSorted, xColumn, yColumn, { maxBins, xKind });
    }
    console.warn(`⚠️ Line bin-aggregate applied: ${cleanSorted.length} → ${budgetedSorted.length} points (xKind=${xKind})`);
  }

  // Dots are expensive at scale; keep the line at budgetedSorted, but cap dot density separately.
  const dotData = sampleEvery(budgetedSorted, budget.maxDots);

  const xLabel = labels?.x || xColumn;
  const yLabel = labels?.y || yColumn;
  const lineConfig: any = { x: xColumn, y: yColumn };
  const dotConfig: any = {
    x: { value: xColumn, label: xLabel },
    y: { value: yColumn, label: yLabel },
    r: 2,
    channels: {
      [xLabel]: { value: xColumn, label: xLabel },
      [yLabel]: { value: yColumn, label: yLabel }
    }
  };
  const colorInfo = colorField ? deriveColorScaleInfo(budgetedSorted, colorField, colorScheme, colorBias) : null;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;

  if (colorField && colorInfo) {
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };

    if (colorInfo.kind === 'continuous') {
      // Apply bias transformation to continuous values
      if (colorBias !== undefined && colorBias !== 0) {
        const [min, max] = colorInfo.domain as [number, number];
        const range_val = max - min;
        const exponent = Math.pow(2, -colorBias);
        
        const transformValue = (d: any) => {
          const value = d[colorColumnName!];
          if (value == null) return null;
          const t = (value - min) / range_val;
          const transformedT = Math.pow(Math.max(0, Math.min(1, t)), exponent);
          return min + transformedT * range_val;
        };
        
        dotConfig.fill = transformValue;
        lineConfig.stroke = transformValue;
        lineConfig.z = null;
      } else if (colorInfo.accessor) {
        dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.stroke = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.z = null;
      } else {
        lineConfig.stroke = colorColumnName;
        lineConfig.z = colorColumnName;
        dotConfig.fill = colorColumnName;
      }
    } else {
      // For discrete color: use column name and group by z value
      lineConfig.stroke = colorColumnName;
      lineConfig.z = colorColumnName;
      dotConfig.fill = colorColumnName;
    }
  } else {
    // When there's no color field, fall back to a single manual color if provided
    const fallbackColor = manualColor || DEFAULT_CHART_COLOR;
    lineConfig.stroke = fallbackColor;
    dotConfig.fill = fallbackColor;
  }

  // Apply size configuration for line width
  if (sizeField && sizeRange) {
    const sizeScale = createSizeScale(budgetedSorted, sizeField, sizeRange, manualSize || 2);
    const sizeColumnName = getResultColumnName(sizeField);
    lineConfig.strokeWidth = (d: any) => sizeScale.getSizeForValue(d[sizeColumnName]);
    dotConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: sizeField.columnName };
  } else {
    lineConfig.strokeWidth = manualSize || 2;
  }
  
  // Disable built-in Observable Plot tooltip (we'll use custom tooltips)
  // dotConfig.tip is not set, which disables the default tooltip
  
  // Add invisible larger dots for better hover detection
  const hoverDotConfig: any = {
    x: xColumn,
    y: yColumn,
    r: 6, // Larger radius for easier hovering (reduced for smaller highlight)
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
  };

  const plotOptions: Plot.PlotOptions = {
    x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true, domain: domain?.x } as any,
    y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true, domain: domain?.y } as any,
    marks: [
      Plot.line(budgetedSorted, lineConfig),
      Plot.dot(dotData, dotConfig),
      Plot.dot(dotData, hoverDotConfig), // Invisible larger dots for easier hovering
    ],
  };

  if (labelCfg) {
    const labelConfig: LabelRenderConfig = {
      data: budgetedSorted,
      xColumn,
      yColumn,
      labelFields: labelCfg.labelFields,
      labelsEnabled: labelCfg.labelsEnabled,
      samplingStrategy: labelCfg.samplingStrategy,
      samplingThreshold: labelCfg.samplingThreshold,
      sampleEvery: labelCfg.sampleEvery,
      chartType: 'line'
    };
    const prepared = prepareLabelData(labelConfig);
    const labelMark = createLabelMark(prepared, labelConfig, xColumn, yColumn);
    if (labelMark) {
      (plotOptions.marks = plotOptions.marks || []).push(labelMark as any);
    }
  }
  
  if (colorField && colorInfo) {
    if (colorInfo.kind === 'continuous') {
      plotOptions.color = {
        type: 'linear',
        domain: colorInfo.domain as [number, number],
        range: colorInfo.range,
        clamp: true,
        label: colorField.columnName,
      } as any;
    } else {
      plotOptions.color = {
        type: 'ordinal' as any,
        domain: colorInfo.domain as any[],
        range: colorInfo.range,
        label: colorField.columnName,
      } as any;
    }
  }
  
  // Add custom tooltip configuration (color is read directly from DOM)
  (plotOptions as any).__customTooltip = {
    enabled: true,
    data: budgetedSorted,
    getFields: createTooltipFieldsGetter(
      [
        { label: xLabel, column: xColumn },
        { label: yLabel, column: yColumn }
      ],
      colorField,
      sizeField,
      tooltipFields
    )
  };
  
  return plotOptions;
}

/**
 * Vertical line chart for continuous measure on X and continuous dimension on Y.
 * Sorts by the Y dimension so the line flows bottom-to-top.
 */
export function verticalLineChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  labels?: { x?: string; y?: string },
  domain?: { x?: [number, number] | [Date, Date]; y?: [number, number] | [Date, Date] },
  colorField?: Field,
  colorScheme?: string,
  colorBias?: number,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number },
  tooltipFields?: Field[]
): Plot.PlotOptions {
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[xColumn]))
    : [];

  if (clean.length === 0) {
    return {
      x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true } as any,
      y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true } as any,
      marks: [],
    };
  }

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
  const cleanSorted = clean.slice().sort((a, b) => {
    const ay = toComparable(a[yColumn]);
    const by = toComparable(b[yColumn]);
    if (ay == null && by == null) return 0;
    if (ay == null) return 1;
    if (by == null) return -1;
    if (typeof ay === 'string' || typeof by === 'string') return String(ay).localeCompare(String(by));
    return (ay as number) - (by as number);
  });

  // ---- Auto bin-aggregation (line-specific) --------------------------------
  const __ = colorField ? deriveColorScaleInfo(cleanSorted, colorField, colorScheme, colorBias) : null;
  const hasDiscreteColor = !!colorField && colorField.flavour === 'discrete';
  const budget = computeLineBudget(hasDiscreteColor);
  const yKind: XKind = inferXKind(cleanSorted.slice(0, 25).map(r => r?.[yColumn]));
  const colorColumnNamePre = colorField ? getResultColumnName(colorField) : undefined;

  const maxBins = budget.maxPoints;
  let budgetedSorted = cleanSorted;
  if (cleanSorted.length > maxBins) {
    if (hasDiscreteColor && colorColumnNamePre) {
      const groups = new Map<any, any[]>();
      for (const r of cleanSorted) {
        const k = r?.[colorColumnNamePre];
        const arr = groups.get(k) || [];
        arr.push(r);
        groups.set(k, arr);
      }
      const reduced: any[] = [];
      for (const [_k, arr] of Array.from(groups.entries())) {
        const arrSorted = arr.slice().sort((a, b) => {
          const ay = toComparable(a[yColumn]);
          const by = toComparable(b[yColumn]);
          if (ay == null && by == null) return 0;
          if (ay == null) return 1;
          if (by == null) return -1;
          if (typeof ay === 'string' || typeof by === 'string') return String(ay).localeCompare(String(by));
          return (ay as number) - (by as number);
        });
        // Here yColumn is the ordered axis; aggregate measure (xColumn) per y-bin.
        reduced.push(...binAggregateLine(arrSorted, yColumn, xColumn, { maxBins, xKind: yKind }));
      }
      budgetedSorted = reduced.slice().sort((a, b) => {
        const ay = toComparable(a[yColumn]);
        const by = toComparable(b[yColumn]);
        if (ay == null && by == null) return 0;
        if (ay == null) return 1;
        if (by == null) return -1;
        if (typeof ay === 'string' || typeof by === 'string') return String(ay).localeCompare(String(by));
        return (ay as number) - (by as number);
      });
    } else {
      budgetedSorted = binAggregateLine(cleanSorted, yColumn, xColumn, { maxBins, xKind: yKind });
    }
    console.warn(`⚠️ Vertical line bin-aggregate applied: ${cleanSorted.length} → ${budgetedSorted.length} points (yKind=${yKind})`);
  }

  const dotData = sampleEvery(budgetedSorted, budget.maxDots);

  const xLabel2 = labels?.x || xColumn;
  const yLabel2 = labels?.y || yColumn;
  const lineConfig: any = { x: xColumn, y: yColumn };
  const dotConfig: any = {
    x: { value: xColumn, label: xLabel2 },
    y: { value: yColumn, label: yLabel2 },
    r: 2,
    channels: {
      [xLabel2]: { value: xColumn, label: xLabel2 },
      [yLabel2]: { value: yColumn, label: yLabel2 }
    }
  };
  
  const colorInfo = colorField ? deriveColorScaleInfo(budgetedSorted, colorField, colorScheme, colorBias) : null;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;

  if (colorField && colorInfo) {
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };

    if (colorInfo.kind === 'continuous') {
      // Apply bias transformation to continuous values
      if (colorBias !== undefined && colorBias !== 0) {
        const [min, max] = colorInfo.domain as [number, number];
        const range_val = max - min;
        const exponent = Math.pow(2, -colorBias);
        
        const transformValue = (d: any) => {
          const value = d[colorColumnName!];
          if (value == null) return null;
          const t = (value - min) / range_val;
          const transformedT = Math.pow(Math.max(0, Math.min(1, t)), exponent);
          return min + transformedT * range_val;
        };
        
        dotConfig.fill = transformValue;
        lineConfig.stroke = transformValue;
        lineConfig.z = null;
      } else if (colorInfo.accessor) {
        dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.stroke = (d: any) => colorInfo.accessor?.(d) ?? null;
        lineConfig.z = null;
      } else {
        lineConfig.stroke = colorColumnName;
        lineConfig.z = colorColumnName;
        dotConfig.fill = colorColumnName;
      }
    } else {
      // For discrete color: use column name and group by z value
      lineConfig.stroke = colorColumnName;
      lineConfig.z = colorColumnName;
      dotConfig.fill = colorColumnName;
    }
  } else {
    lineConfig.stroke = DEFAULT_CHART_COLOR;
    dotConfig.fill = DEFAULT_CHART_COLOR;
  }

  // Apply size configuration for line width
  if (sizeField && sizeRange) {
    const sizeScale = createSizeScale(budgetedSorted, sizeField, sizeRange, manualSize || 2);
    const sizeColumnName = getResultColumnName(sizeField);
    lineConfig.strokeWidth = (d: any) => sizeScale.getSizeForValue(d[sizeColumnName]);
  } else {
    lineConfig.strokeWidth = manualSize || 2;
  }
  
  // Disable built-in Observable Plot tooltip (we'll use custom tooltips)
  // dotConfig.tip is not set, which disables the default tooltip
  
  // Add invisible larger dots for better hover detection
  const hoverDotConfig: any = {
    x: xColumn,
    y: yColumn,
    r: 6, // Larger radius for easier hovering (reduced for smaller highlight)
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
  };
  
  const plotOptions: Plot.PlotOptions = {
    x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true, domain: domain?.x } as any,
    y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true, domain: domain?.y } as any,
    marks: [
      Plot.line(budgetedSorted, lineConfig),
      Plot.dot(dotData, dotConfig),
      Plot.dot(dotData, hoverDotConfig), // Invisible larger dots for easier hovering
    ],
  };

  if (labelCfg) {
    const labelConfig: LabelRenderConfig = {
      data: budgetedSorted,
      xColumn,
      yColumn,
      labelFields: labelCfg.labelFields,
      labelsEnabled: labelCfg.labelsEnabled,
      samplingStrategy: labelCfg.samplingStrategy,
      samplingThreshold: labelCfg.samplingThreshold,
      sampleEvery: labelCfg.sampleEvery,
      chartType: 'verticalLine'
    };
    const prepared = prepareLabelData(labelConfig);
    const labelMark = createLabelMark(prepared, labelConfig, xColumn, yColumn);
    if (labelMark) {
      (plotOptions.marks = plotOptions.marks || []).push(labelMark as any);
    }
  }
  
  if (colorField && colorInfo) {
    if (colorInfo.kind === 'continuous') {
      plotOptions.color = {
        type: 'linear',
        domain: colorInfo.domain as [number, number],
        range: colorInfo.range,
        clamp: true,
        label: colorField.columnName,
      } as any;
    } else {
      plotOptions.color = {
        type: 'ordinal' as any,
        domain: colorInfo.domain as any[],
        range: colorInfo.range,
        label: colorField.columnName,
      } as any;
    }
  }
  
  // Add custom tooltip configuration (color is read directly from DOM)
  (plotOptions as any).__customTooltip = {
    enabled: true,
    data: budgetedSorted,
    getFields: createTooltipFieldsGetter(
      [
        { label: xLabel2, column: xColumn },
        { label: yLabel2, column: yColumn }
      ],
      colorField,
      sizeField,
      tooltipFields
    )
  };
  
  return plotOptions;
}
