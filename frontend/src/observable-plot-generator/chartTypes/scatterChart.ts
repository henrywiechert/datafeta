import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR, DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createSizeScale } from '../utils/sizeUtils';
// Label utilities
import { createLabelMark, prepareLabelData, LabelRenderConfig } from '../utils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';
import { formatDateTick } from '../utils/dateFormatUtils';

type ScatterResultBudget = {
  maxPoints: number;
  // If discrete color is present, we sample per category to preserve representation
  stratifyBy?: string;
  minPerStratum: number;
};

function computeScatterBudget(clean: any[], colorField?: Field): ScatterResultBudget {
  const hasDiscreteColor = !!colorField && colorField.flavour === 'discrete';
  // Heuristic: Observable Plot struggles earlier when there is discrete color (multiple series).
  // Keep this conservative; backend/local reduction should normally keep us under this anyway.
  const maxPoints = hasDiscreteColor ? 20_000 : 100_000;
  const minPerStratum = hasDiscreteColor ? 200 : 0;
  const stratifyBy = hasDiscreteColor && colorField ? getResultColumnName(colorField) : undefined;
  return { maxPoints, stratifyBy, minPerStratum };
}

function stratifiedSampleRows(rows: any[], stratifyBy: string, maxPoints: number, minPerStratum: number): any[] {
  if (rows.length <= maxPoints) return rows;
  const groups = new Map<any, any[]>();
  for (const r of rows) {
    const k = r?.[stratifyBy];
    const arr = groups.get(k) || [];
    arr.push(r);
    groups.set(k, arr);
  }

  const total = rows.length;
  const entries = Array.from(groups.entries());
  const picks: any[] = [];

  // Shuffle helper (Fisher–Yates)
  const shuffle = (arr: any[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // First pass: proportional target with floor, but respect minPerStratum
  const targets = entries.map(([k, arr]) => {
    const proportional = Math.floor((maxPoints * arr.length) / total);
    const target = Math.min(arr.length, Math.max(minPerStratum, proportional));
    return { k, arr, target };
  });

  // Adjust down if we overshot maxPoints (common with minPerStratum)
  let currentTotal = targets.reduce((s, t) => s + t.target, 0);
  if (currentTotal > maxPoints) {
    // Reduce targets from the largest groups first, never below minPerStratum (or 1 if group exists)
    targets.sort((a, b) => b.target - a.target);
    let i = 0;
    while (currentTotal > maxPoints && targets.length > 0) {
      const t = targets[i % targets.length];
      const floorMin = Math.min(t.arr.length, Math.max(minPerStratum, 1));
      if (t.target > floorMin) {
        t.target -= 1;
        currentTotal -= 1;
      }
      i++;
      // Safety break
      if (i > 10_000_000) break;
    }
  }

  for (const t of targets) {
    const arr = shuffle(t.arr.slice());
    picks.push(...arr.slice(0, t.target));
  }

  // If we undershot due to rounding, top up uniformly
  if (picks.length < maxPoints) {
    const remaining = rows.filter(r => !picks.includes(r));
    shuffle(remaining);
    picks.push(...remaining.slice(0, maxPoints - picks.length));
  }

  return picks;
}

/**
 * Scatter chart for continuous measure vs continuous measure or dimension.
 */
export function scatterChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  options?: { x?: string; y?: string; domain?: { x?: [number, number] | [Date, Date]; y?: [number, number] | [Date, Date] } },
  colorField?: Field,
  colorScheme?: string,
  colorBias?: number,
  // Optional manual color used when there is no color field
  manualColor?: string,
  sizeField?: Field,
  sizeRange?: [number, number],
  manualSize?: number
  , labelCfg?: { labelFields: Field[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number }
  , tooltipFields?: Field[]
): Plot.PlotOptions {
  // Detect axis value kinds by sampling up to first 20 non-null values
  const sampleValues = (column: string) => (Array.isArray(data) ? data.map(r => r?.[column]).filter(v => v !== null && v !== undefined) : []);
  const xSamples = sampleValues(xColumn);
  const ySamples = sampleValues(yColumn);
  const isDateLike = (v: any) => v instanceof Date || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  const xIsDate = xSamples.some(isDateLike);
  const yIsDate = ySamples.some(isDateLike);
  const isNumeric = (v: any) => typeof v === 'number' && Number.isFinite(v);
  const isValid = (col: string, isDateAxis: boolean, val: any) => {
    if (isDateAxis) return isDateLike(val);
    return isNumeric(val);
  };

  // Build cleaned & normalized data: convert date-like strings to Date objects so Plot time scale works
  const clean: any[] = Array.isArray(data)
    ? data.filter(d => isValid(xColumn, xIsDate, d?.[xColumn]) && isValid(yColumn, yIsDate, d?.[yColumn]))
        .map(d => {
          if (!xIsDate && !yIsDate) return d; // no normalization needed
          const copy: any = { ...d };
          if (xIsDate && !(copy[xColumn] instanceof Date)) copy[xColumn] = new Date(copy[xColumn]);
          if (yIsDate && !(copy[yColumn] instanceof Date)) copy[yColumn] = new Date(copy[yColumn]);
          return copy;
        })
    : [];

  if (clean.length === 0) {
    // Render empty axes (no points) so the cell shape matches others
    return {
      x: {
        label: options?.x || xColumn,
        domainKey: xColumn,
        grid: true,
        domain: options?.domain?.x,
        // If axis inferred as date, ensure time scale with concise formatting
        ...(xIsDate ? { type: 'utc' as any, tickFormat: formatDateTick } : {})
      } as any,
      y: {
        label: options?.y || yColumn,
        domainKey: yColumn,
        grid: true,
        domain: options?.domain?.y,
        ...(yIsDate ? { type: 'utc' as any, tickFormat: formatDateTick } : {})
      } as any,
      marks: [],
    };
  }

  // Result budget / safeguard: avoid rendering pathological numbers of points.
  // Prefer stratified sampling when discrete color is present.
  const budget = computeScatterBudget(clean, colorField);
  const budgeted = budget.stratifyBy
    ? stratifiedSampleRows(clean, budget.stratifyBy, budget.maxPoints, budget.minPerStratum)
    : (clean.length > budget.maxPoints ? clean.sort(() => Math.random() - 0.5).slice(0, budget.maxPoints) : clean);

  const xLabel = options?.x || xColumn;
  const yLabel = options?.y || yColumn;
  const dotConfig: any = {
    x: { value: xColumn, label: xLabel },
    y: { value: yColumn, label: yLabel },
    r: 4,
    channels: {
      [xLabel]: { value: xColumn, label: xLabel },
      [yLabel]: { value: yColumn, label: yLabel }
    },
  };
  
  const colorInfo = colorField ? deriveColorScaleInfo(budgeted, colorField, colorScheme, colorBias) : null;
  if (colorField && colorInfo) {
    const colorColumnName = getResultColumnName(colorField);
    dotConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };

    if (colorInfo.kind === 'continuous') {
      // Apply bias transformation to continuous values
      if (colorBias !== undefined && colorBias !== 0) {
        const [min, max] = colorInfo.domain as [number, number];
        const range_val = max - min;
        const exponent = Math.pow(2, -colorBias);
        
        dotConfig.fill = (d: any) => {
          const value = d[colorColumnName];
          if (value == null) return null;
          // Normalize to [0, 1]
          const t = (value - min) / range_val;
          // Apply power transform
          const transformedT = Math.pow(Math.max(0, Math.min(1, t)), exponent);
          // Return denormalized value for the scale to map
          return min + transformedT * range_val;
        };
      } else if (colorInfo.accessor) {
        dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
      } else {
        dotConfig.fill = colorColumnName;
      }
    } else {
      dotConfig.fill = colorColumnName;
    }
  } else {
    // When there's no color field, fall back to a single manual color if provided
    dotConfig.fill = manualColor || DEFAULT_CHART_COLOR;
  }

  // Apply size configuration
  if (sizeField && sizeRange) {
    const sizeScale = createSizeScale(clean, sizeField, sizeRange, manualSize || 4);
    // Determine actual column name (handle implicit SUM aggregation alias like sizeUtils does)
    let sizeColumnName = getResultColumnName(sizeField);
    if (sizeField.type === 'measure' && !sizeField.aggregation) {
      const sumAlias = `SUM(${sizeField.columnName})`;
      if (clean.length && Object.prototype.hasOwnProperty.call(clean[0], sumAlias)) {
        sizeColumnName = sumAlias;
      }
    }
    // Provide a direct radius in pixels so we add an identity scale at plot level
    dotConfig.r = (d: any) => sizeScale.getSizeForValue(d[sizeColumnName]);
    dotConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: sizeField.columnName };
  } else {
    dotConfig.r = manualSize || 4;
  }
  
  // Disable built-in Observable Plot tooltip (we'll use custom tooltips)
  // dotConfig.tip is not set, which disables the default tooltip
  
  // Calculate domains: use shared domains if provided (for faceting/grids), otherwise calculate from local data.
  // Numeric padding uses DOMAIN_PAD_RATIO; date padding expands by ratio of range.
  let xDomain: [number, number] | [Date, Date] | undefined;
  let yDomain: [number, number] | [Date, Date] | undefined;

  const buildNumericDomain = (values: number[]): [number, number] => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const pad = range * DOMAIN_PAD_RATIO;
    return [min - pad, max + pad];
  };
  const buildDateDomain = (values: Date[]): [Date, Date] => {
    const timestamps = values.map(d => d.getTime());
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const range = maxTs - minTs;
    const pad = range * DOMAIN_PAD_RATIO;
    return [new Date(minTs - pad), new Date(maxTs + pad)];
  };

  if (options?.domain?.x) {
    xDomain = options.domain.x;
  } else {
    if (xIsDate) {
      const values = clean.map(d => d[xColumn] as Date);
      xDomain = buildDateDomain(values);
    } else {
      const values = clean.map(d => d[xColumn] as number);
      xDomain = buildNumericDomain(values);
    }
  }
  if (options?.domain?.y) {
    yDomain = options.domain.y;
  } else {
    if (yIsDate) {
      const values = clean.map(d => d[yColumn] as Date);
      yDomain = buildDateDomain(values);
    } else {
      const values = clean.map(d => d[yColumn] as number);
      yDomain = buildNumericDomain(values);
    }
  }
  
  const plotOptions: Plot.PlotOptions = {
    x: {
      label: options?.x || xColumn,
      domainKey: xColumn,
      grid: true,
      domain: xDomain,
      nice: false,
      ...(xIsDate ? { type: 'utc' as any, tickFormat: formatDateTick } : {})
    } as any,
    y: {
      label: options?.y || yColumn,
      domainKey: yColumn,
      grid: true,
      domain: yDomain,
      nice: false,
      ...(yIsDate ? { type: 'utc' as any, tickFormat: formatDateTick } : {})
    } as any,
    r: { type: 'identity' } as any,
    marks: [Plot.dot(budgeted, dotConfig)],
  };

  // Label integration
  if (labelCfg) {
    const labelConfig: LabelRenderConfig = {
      data: clean,
      xColumn,
      yColumn,
      labelFields: labelCfg.labelFields,
      labelsEnabled: labelCfg.labelsEnabled,
      samplingStrategy: labelCfg.samplingStrategy,
      samplingThreshold: labelCfg.samplingThreshold,
      sampleEvery: labelCfg.sampleEvery,
      chartType: 'scatter'
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
    data: clean,
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


