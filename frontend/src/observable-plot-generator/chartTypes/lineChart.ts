import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR, DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createSizeScale } from '../utils/sizeUtils';
import { createLegacyLabelMark, prepareLabelData, LabelRenderConfig } from '../utils/labelUtils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';
import { formatDateTick } from '../utils/dateFormatUtils';

// ---------- Orientation abstraction -----------------------------------------

export type LineOrientation = 'horizontal' | 'vertical';

const LINE_ORIENTATION = {
  horizontal: {
    independentAxis: 'x' as const,
    dependentAxis: 'y' as const,
    chartType: 'line' as const,
  },
  vertical: {
    independentAxis: 'y' as const,
    dependentAxis: 'x' as const,
    chartType: 'verticalLine' as const,
  }
} as const;

// ---------- Types & Interfaces ----------------------------------------------

export interface LineBuildParams {
  data: any[];
  xColumn: string;
  yColumn: string;
  orientation: LineOrientation;
  labels?: { x?: string; y?: string };
  domain?: { x?: [number, number] | [Date, Date]; y?: [number, number] | [Date, Date] };
  colorField?: Field;
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;
  sizeField?: Field;
  sizeRange?: [number, number];
  manualSize?: number;
  labelCfg?: {
    labelFields: Field[];
    labelsEnabled: boolean;
    samplingStrategy: 'auto' | 'all' | 'sample';
    samplingThreshold: number;
    sampleEvery: number;
  };
  tooltipFields?: Field[];
  /** Facet fields to display in tooltips for context (from faceted charts) */
  facetFields?: Field[];
  /** Original x/y Field objects, used to enrich tooltip labels with aggregation info. */
  xField?: Field;
  yField?: Field;
}

type LineBudget = {
  maxPoints: number;
  // Prefer allocating a minimum per series when there is discrete color (multiple lines).
  minPerSeries: number;
  // Dot marks are much heavier than a single path; cap dots separately to avoid stack overflows.
  maxDots: number;
};

function computeLineBudget(hasDiscreteColor: boolean): LineBudget {
  // Lines (and dots) can stack overflow when we render hundreds of thousands of points.
  // Dots are heavier than line segments so they get a separate (lower) cap.
  return {
    maxPoints: hasDiscreteColor ? 1_000 : 1_000,
    minPerSeries: hasDiscreteColor ? 200 : 0,
    // 5_000 lets typical multi-series datasets (e.g. 200 countries × 25 years)
    // show every dot while still protecting against stack overflows.
    maxDots: hasDiscreteColor ? 5_000 : 2_000,
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
 * Convert a value to a comparable form for sorting (number, string, or null).
 * Handles Date, number, and string (with numeric/date parsing).
 */
function toComparable(v: any): number | string | null {
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
}

/**
 * Sort comparator using toComparable for a given column.
 */
function compareByColumn(column: string) {
  return (a: any, b: any): number => {
    const av = toComparable(a[column]);
    const bv = toComparable(b[column]);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv));
    return (av as number) - (bv as number);
  };
}

// ---------- Domain helpers ---------------------------------------------------

/**
 * Recompute the dependent-axis domain from the (possibly bin-aggregated) data.
 * This ensures the Y-axis scale matches the actually-plotted values rather than
 * the pre-binning raw data, which can have a much wider range (especially with AVG).
 */
function recomputeDependentDomain(
  rows: any[],
  dependentColumn: string
): [number, number] | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const v = row[dependentColumn];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity || max === -Infinity) return undefined;
  if (min === max) {
    // Avoid zero-span domain
    const pad = min === 0 ? 1 : Math.abs(min) * DOMAIN_PAD_RATIO;
    return [min - pad, max + pad];
  }
  const span = max - min;
  const pad = span * DOMAIN_PAD_RATIO;
  return [min - pad, max + pad];
}

// ---------- Core Builder ----------------------------------------------------

/**
 * Unified line chart builder supporting both horizontal (x=independent) and vertical (y=independent) orientations.
 */
export function buildLineOptions(params: LineBuildParams): Plot.PlotOptions {
  const {
    data,
    xColumn,
    yColumn,
    orientation,
    labels,
    domain,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    sizeField,
    sizeRange,
    manualSize,
    labelCfg,
    tooltipFields,
    facetFields,
    xField,
    yField,
  } = params;

  const O = LINE_ORIENTATION[orientation];
  const independentColumn = orientation === 'horizontal' ? xColumn : yColumn;
  const dependentColumn = orientation === 'horizontal' ? yColumn : xColumn;

  // Filter to finite numeric values for the dependent axis
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[dependentColumn]))
    : [];

  if (clean.length === 0) {
    return {
      x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true } as any,
      y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true } as any,
      marks: [],
    };
  }

  // Sort by the independent axis so the line flows correctly
  const cleanSorted = clean.slice().sort(compareByColumn(independentColumn));

  // ---- Auto bin-aggregation (line-specific) --------------------------------
  const hasDiscreteColor = !!colorField && colorField.flavour === 'discrete';
  const budget = computeLineBudget(hasDiscreteColor);
  const axisKind: XKind = inferXKind(cleanSorted.slice(0, 25).map(r => r?.[independentColumn]));
  const colorColumnNamePre = colorField ? getResultColumnName(colorField) : undefined;

  const maxBins = budget.maxPoints;
  let budgetedSorted = cleanSorted;
  if (cleanSorted.length > maxBins) {
    if (hasDiscreteColor && colorColumnNamePre) {
      // Group by color, bin-aggregate each group separately
      const groups = new Map<any, any[]>();
      for (const r of cleanSorted) {
        const k = r?.[colorColumnNamePre];
        const arr = groups.get(k) || [];
        arr.push(r);
        groups.set(k, arr);
      }
      const reduced: any[] = [];
      for (const [, arr] of Array.from(groups.entries())) {
        const arrSorted = arr.slice().sort(compareByColumn(independentColumn));
        reduced.push(...binAggregateLine(arrSorted, independentColumn, dependentColumn, { maxBins, xKind: axisKind }));
      }
      budgetedSorted = reduced.slice().sort(compareByColumn(independentColumn));
    } else {
      budgetedSorted = binAggregateLine(cleanSorted, independentColumn, dependentColumn, { maxBins, xKind: axisKind });
    }
    const chartLabel = orientation === 'horizontal' ? 'Line' : 'Vertical line';
    console.warn(`⚠️ ${chartLabel} bin-aggregate applied: ${cleanSorted.length} → ${budgetedSorted.length} points (axisKind=${axisKind})`);
  }

  // Always compute the dependent-axis domain from the actually-plotted data.
  // The caller-supplied domain (from computeSharedMeasureDomains) may use
  // bar-chart stacking logic that inflates the range far beyond any individual
  // value — wrong for line charts. For faceted grids the coordinator will
  // harmonize per-cell domains into a shared scale afterwards.
  const plotData = budgetedSorted.length > 0 ? budgetedSorted : cleanSorted;
  const recomputedDependent = recomputeDependentDomain(plotData, dependentColumn);
  let effectiveDomain = domain;
  if (recomputedDependent) {
    effectiveDomain = {
      ...domain,
      [O.dependentAxis]: recomputedDependent,
    };
  }

  // Dots are expensive at scale; cap dot density separately.
  // When there is a discrete color field (multiple series), sample per-series so
  // that the stride is independent of backend row order — otherwise a global
  // stride can skip entire countries or pick different rows on each re-query.
  // Use the actual total dot count to decide whether sampling is needed at all;
  // if the data already fits within the budget, show every point.
  let dotData: any[];
  if (hasDiscreteColor && colorColumnNamePre) {
    if (budgetedSorted.length <= budget.maxDots) {
      // All points fit within budget — no need to sample
      dotData = budgetedSorted;
    } else {
      const seriesGroups = new Map<any, any[]>();
      for (const r of budgetedSorted) {
        const k = r?.[colorColumnNamePre];
        const arr = seriesGroups.get(k) || [];
        arr.push(r);
        seriesGroups.set(k, arr);
      }
      const numSeries = seriesGroups.size || 1;
      const perSeriesMax = Math.max(2, Math.floor(budget.maxDots / numSeries));
      const perSeriesResult: any[] = [];
      for (const [, arr] of Array.from(seriesGroups.entries())) {
        const arrSorted = arr.slice().sort(compareByColumn(independentColumn));
        perSeriesResult.push(...sampleEvery(arrSorted, perSeriesMax));
      }
      dotData = perSeriesResult;
    }
  } else {
    dotData = sampleEvery(budgetedSorted, budget.maxDots);
  }

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
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: getFieldDisplayName(colorField) };

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
    dotConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: getFieldDisplayName(sizeField) };
  } else {
    lineConfig.strokeWidth = manualSize || 2;
  }
  
  // Add invisible larger dots for better hover detection.
  // Include the same z/stroke grouping as the visible dots so that Observable
  // Plot's pointer selection stays within the correct series when multiple
  // series overlap at the same x position.
  const hoverDotConfig: any = {
    x: xColumn,
    y: yColumn,
    r: 6,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 0,
    ...(colorColumnName ? { z: colorColumnName } : {}),
  };

  const xIsTime = axisKind === 'time' || (effectiveDomain?.x?.[0] instanceof Date);
  const yIsTime = effectiveDomain?.y?.[0] instanceof Date;

  const plotOptions: Plot.PlotOptions = {
    x: {
      label: labels?.x || xColumn,
      domainKey: xColumn,
      grid: true,
      domain: effectiveDomain?.x,
      ...(xIsTime ? { type: 'utc' as any, tickFormat: formatDateTick } : {}),
    } as any,
    y: {
      label: labels?.y || yColumn,
      domainKey: yColumn,
      grid: true,
      domain: effectiveDomain?.y,
      ...(yIsTime ? { type: 'utc' as any, tickFormat: formatDateTick } : {}),
    } as any,
    marks: [
      Plot.line(budgetedSorted, lineConfig),
      Plot.dot(dotData, dotConfig),
      Plot.dot(dotData, hoverDotConfig),
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
      chartType: O.chartType
    };
    const prepared = prepareLabelData(labelConfig);
    const labelMark = createLegacyLabelMark(prepared, labelConfig, xColumn, yColumn);
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
        label: getFieldDisplayName(colorField),
      } as any;
    } else {
      plotOptions.color = {
        type: 'ordinal' as any,
        domain: colorInfo.domain as any[],
        range: colorInfo.range,
        label: getFieldDisplayName(colorField),
      } as any;
    }
  }
  
  // Add custom tooltip configuration.
  // Use dotData (not budgetedSorted) because Observable Plot stores numeric
  // indices into the data array passed to Plot.dot() in __data__. The tooltip
  // resolver looks up config.data[index], so it must match the dots' data source.
  (plotOptions as any).__customTooltip = {
    enabled: true,
    data: dotData,
    getFields: createTooltipFieldsGetter(
      [
        { label: xLabel, column: xColumn, sourceField: xField },
        { label: yLabel, column: yColumn, sourceField: yField }
      ],
      colorField,
      sizeField,
      tooltipFields,
      undefined, // No excludeColumns
      facetFields
    )
  };

  // Metadata for facet-grid harmonization: the coordinator merges per-cell
  // domains so all facets share the same scale (see harmonizeLineChartDomains).
  if (recomputedDependent) {
    (plotOptions as any).__lineChartDomainInfo = {
      axis: O.dependentAxis,
      column: dependentColumn,
      domain: recomputedDependent,
    };
  }
  
  return plotOptions;
}

// ---------- Facet harmonization ----------------------------------------------

/**
 * Harmonize line chart dependent-axis domains across multiple plots so faceted
 * grids share the same scale. Collects per-cell recomputed domains (attached
 * by buildLineOptions as __lineChartDomainInfo) and replaces them with the
 * union across all cells grouped by axis + column.
 *
 * Safe to call on mixed plot arrays — non-line-chart plots are ignored.
 */
export function harmonizeLineChartDomains(
  plots: Array<{ options: Plot.PlotOptions }>
): void {
  type Entry = { options: any; domain: [number, number] };
  const groups = new Map<string, Entry[]>();

  for (const plot of plots) {
    const info = (plot.options as any)?.__lineChartDomainInfo;
    if (!info?.domain) continue;
    const key = `${info.axis}:${info.column}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push({ options: plot.options, domain: info.domain });
  }

  groups.forEach((group) => {
    if (group.length <= 1) return;

    const sharedMin = Math.min(...group.map((g: Entry) => g.domain[0]));
    const sharedMax = Math.max(...group.map((g: Entry) => g.domain[1]));
    const shared: [number, number] = [sharedMin, sharedMax];

    for (const { options } of group) {
      const info = options.__lineChartDomainInfo;
      if (options[info.axis]) {
        options[info.axis].domain = shared;
      }
      info.domain = shared;
    }
  });
}

// ---------- Public API (thin wrappers) --------------------------------------

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
  manualColor?: string,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number },
  tooltipFields?: Field[],
  facetFields?: Field[],
  xField?: Field,
  yField?: Field,
): Plot.PlotOptions {
  return buildLineOptions({
    data,
    xColumn,
    yColumn,
    orientation: 'horizontal',
    labels,
    domain,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    sizeField,
    sizeRange,
    manualSize,
    labelCfg,
    tooltipFields,
    facetFields,
    xField,
    yField,
  });
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
  manualColor?: string,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number,
  labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number },
  tooltipFields?: Field[],
  facetFields?: Field[],
  xField?: Field,
  yField?: Field,
): Plot.PlotOptions {
  return buildLineOptions({
    data,
    xColumn,
    yColumn,
    orientation: 'vertical',
    labels,
    domain,
    colorField,
    colorScheme,
    colorBias,
    manualColor,
    sizeField,
    sizeRange,
    manualSize,
    labelCfg,
    tooltipFields,
    facetFields,
    xField,
    yField,
  });
}
