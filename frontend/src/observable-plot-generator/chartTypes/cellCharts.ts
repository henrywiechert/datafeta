import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { getFieldColumnName } from '../helpers/fields';
import { lineChart, verticalLineChart } from './lineChart';
import { scatterChart } from './scatterChart';
import { tickStrip } from './tickStrip';
import { CellChartType, ChartTypeOverrides, resolveChartTypeForPair } from '../helpers/chartTypeResolver';

type Domains = Record<string, [number, number]> | undefined;

/**
 * Generate PlotOptions for a single cell given X/Y fields and optional shared measure domains.
 * Supports overrides for chart type selection.
 */
export function generatePairChartOptions(
  data: any[],
  xField: Field | null,
  yField: Field | null,
  sharedMeasureDomains?: Domains,
  overrides?: ChartTypeOverrides,
  colorField?: Field
): Plot.PlotOptions {
  if (!xField && !yField) {
    return messageOptions('No fields');
  }

  // If one side is missing, choose orientation by the present measure
  if (xField && !yField) {
    if (xField.type === 'measure') return createBarX(data, xField, null, sharedMeasureDomains);
    // Single dimension alone → show tick strip would be an alternative, but inside cartesian grid we stick to scatter
    return scatterForDimOnly(data, xField, colorField);
  }
  if (!xField && yField) {
    if (yField.type === 'measure') return createBarY(data, yField, null, sharedMeasureDomains);
    return scatterForDimOnly(data, yField, colorField);
  }

  const xf = xField!;
  const yf = yField!;
  const selected: CellChartType = resolveChartTypeForPair(xf, yf, overrides);

  switch (selected) {
    case 'scatter': {
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      // Apply shared domains if available
      const xDomain = sharedMeasureDomains?.[xCol];
      const yDomain = sharedMeasureDomains?.[yCol];
      const domainOptions = {
        x: xCol, 
        y: yCol,
        ...(xDomain || yDomain ? { domain: { x: xDomain, y: yDomain } } : {})
      };
      // Special-case: measure vs measure should be a single dot (global aggregate),
      // not one dot per record (which may be grouped by unrelated dimensions).
      if (xf.type === 'measure' && yf.type === 'measure') {
        const aggregate = (col: string, agg?: string) => {
          const values = (Array.isArray(data) ? data : []).map((d) => d?.[col]).filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
          if (values.length === 0) return undefined as unknown as number;
          const a = (agg || 'sum').toLowerCase();
          switch (a) {
            case 'sum':
            case undefined as any:
              return values.reduce((s, v) => s + v, 0);
            case 'count':
            case 'count_distinct':
              // COUNT aliases are already counts per group; sum them
              return values.reduce((s, v) => s + v, 0);
            case 'min':
              return Math.min(...values);
            case 'max':
              return Math.max(...values);
            case 'avg':
              // Fallback to simple mean across groups (not weighted); acceptable for now
              return values.reduce((s, v) => s + v, 0) / values.length;
            default:
              return values.reduce((s, v) => s + v, 0);
          }
        };
        const single = [{ [xCol]: aggregate(xCol, (xf as any).aggregation), [yCol]: aggregate(yCol, (yf as any).aggregation) } as any];
        return scatterChart(single, xCol, yCol, domainOptions, colorField);
      }
      // Otherwise render scatter with full data
      return scatterChart(data, xCol, yCol, domainOptions, colorField);
    }
    case 'line': {
      // measure vs continuous dimension – ensure dimension on one axis
      if (xf.type === 'measure' && yf.type === 'dimension') {
        // Prefer vertical line when measure is on X and dimension on Y
        const xCol = getResultColumnName({ ...xf, aggregation: xf.aggregation || 'sum' } as any);
        const yCol = getResultColumnName(yf);
        const xDomain = sharedMeasureDomains?.[xCol];
        const yDomain = sharedMeasureDomains?.[yCol];
        return verticalLineChart(data, xCol, yCol, { x: xCol, y: getFieldDisplayName(yf) }, { x: xDomain, y: yDomain }, colorField);
      }
      if (xf.type === 'dimension' && yf.type === 'measure') {
        const xCol = getResultColumnName(xf);
        const yCol = getResultColumnName({ ...yf, aggregation: yf.aggregation || 'sum' } as any);
        const xDomain = sharedMeasureDomains?.[xCol];
        const yDomain = sharedMeasureDomains?.[yCol];
        return lineChart(data, xCol, yCol, { x: getFieldDisplayName(xf), y: yCol }, { x: xDomain, y: yDomain }, colorField);
      }
      // If both are measures or both are dimensions, fallback to scatter (empty if no data)
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      return scatterChart(data, xCol, yCol, { x: xCol, y: yCol }, colorField);
    }
    case 'barX': {
      return createBarX(data, xf, yf.type === 'dimension' ? yf : null, sharedMeasureDomains, colorField);
    }
    case 'barY': {
      return createBarY(data, yf, xf.type === 'dimension' ? xf : null, sharedMeasureDomains, colorField);
    }
    case 'tickX': {
      // continuous dimension on X, optional discrete dimension category on Y
      const xDim = xf.type === 'dimension' && xf.flavour === 'continuous' ? xf : null;
      const category = yf.type === 'dimension' && yf.flavour === 'discrete' ? yf : null;
      if (xDim) {
        return tickStrip(
          // Build minimal context for tickStrip API
          { xFields: [], yFields: [], queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any },
          'x',
          getResultColumnName(xDim),
          category ? getResultColumnName(category) : undefined
        );
      }
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      return scatterChart(data, xCol, yCol, { x: xCol, y: yCol }, colorField);
    }
    case 'tickY': {
      // continuous dimension on Y, optional discrete dimension category on X
      const yDim = yf.type === 'dimension' && yf.flavour === 'continuous' ? yf : null;
      const category = xf.type === 'dimension' && xf.flavour === 'discrete' ? xf : null;
      if (yDim) {
        return tickStrip(
          { xFields: [], yFields: [], queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any },
          'y',
          getResultColumnName(yDim),
          category ? getResultColumnName(category) : undefined
        );
      }
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      return scatterChart(data, xCol, yCol, { x: xCol, y: yCol }, colorField);
    }
    case 'dot': {
      const xCol = xf.columnName;
      const yCol = yf.columnName;
      return {
        x: { label: xCol },
        y: { label: yCol },
        marks: [Plot.dot(data, { x: xCol, y: yCol, fill: DEFAULT_CHART_COLOR, r: 2 })],
      };
    }
    default:
      return messageOptions('Unsupported combination');
  }
}

function resolveXYColumns(xf: Field, yf: Field): { xCol: string; yCol: string } {
  const xCol = xf.type === 'measure'
    ? getResultColumnName({ ...xf, aggregation: xf.aggregation || 'sum' } as any)
    : getResultColumnName(xf);
  const yCol = yf.type === 'measure'
    ? getResultColumnName({ ...yf, aggregation: yf.aggregation || 'sum' } as any)
    : getResultColumnName(yf);
  return { xCol, yCol };
}

// function isNumericColumn(data: any[], col: string): boolean {
//   if (!Array.isArray(data) || data.length === 0) return false;
//   return data.some((d) => Number.isFinite(d?.[col]));
// }

function createBarX(
  data: any[],
  measure: Field,
  yDimension: Field | null,
  sharedDomains?: Domains,
  colorField?: Field
): Plot.PlotOptions {
  const measureName = getResultColumnName({ ...measure, aggregation: measure.aggregation || 'sum' } as any);
  let domain = (sharedDomains && sharedDomains[measureName]) || undefined;
  // For bars, force baseline at 0 and +5% headroom
  if (Array.isArray(domain)) {
    const upperRaw = Math.max(0, domain[1] as number);
    domain = [0, (upperRaw === 0 ? 1 : upperRaw * 1.05)] as any;
  } else {
    // If no domain provided, compute from data
    const vals = data.map((d) => d?.[measureName]).filter((v) => typeof v === 'number' && !Number.isNaN(v));
    const max = vals.length ? Math.max(0, ...vals) : 0;
    domain = [0, max === 0 ? 1 : max * 1.05] as any;
  }

  const opts: Plot.PlotOptions = {
    x: { label: measureName, grid: true, domain, nice: false },
    marks: [Plot.ruleX([0])],
  };

  if (yDimension) {
    // Remove hardcoded height for responsive sizing
    const yColumnName = getFieldColumnName(yDimension);
    const categories = Array.from(new Set(data.map((row) => row[yColumnName])));
    // Preserve ordering by domain even when data missing; force all known categories if available in sharedDomains via label key
    const domainKey = yColumnName;
    const sharedDomain = (sharedDomains && (sharedDomains as any)[domainKey]) as any[] | undefined;
    opts.y = { label: yColumnName, domain: (sharedDomain && Array.isArray(sharedDomain) ? sharedDomain : categories) as any, type: 'band' as any, padding: 0.1 as any };
    // Ensure consistent bar thickness regardless of viewport: set fixed padding
    opts.marginTop = 0;
    opts.marginBottom = 0;
    opts.inset = 0;
    opts.height = Math.max(BAR_STEP_PX * 2, categories.length * BAR_STEP_PX);
    opts.marks!.push(
      Plot.barX(data, { x: measureName, y: yColumnName, fill: colorField ? getFieldColumnName(colorField) : DEFAULT_CHART_COLOR })
    );
  } else {
    // Remove hardcoded height for responsive sizing
    opts.y = { label: ' ' };
    opts.height = BAR_STEP_PX * 2;
    opts.marks!.push(
      Plot.barX(data, { x: measureName, fill: colorField ? getFieldColumnName(colorField) : DEFAULT_CHART_COLOR })
    );
  }

  return opts;
}

function createBarY(
  data: any[],
  measure: Field,
  xDimension: Field | null,
  sharedDomains?: Domains,
  colorField?: Field
): Plot.PlotOptions {
  const measureName = getResultColumnName({ ...measure, aggregation: measure.aggregation || 'sum' } as any);
  let domain = (sharedDomains && sharedDomains[measureName]) || undefined;
  // For bars, force baseline at 0 and +5% headroom
  if (Array.isArray(domain)) {
    const upperRaw = Math.max(0, domain[1] as number);
    domain = [0, (upperRaw === 0 ? 1 : upperRaw * 1.05)] as any;
  } else {
    const vals = data.map((d) => d?.[measureName]).filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (vals.length > 0) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      domain = [Math.min(0, min), max <= 0 ? 0 : max] as any;
    }
  }

  const opts: Plot.PlotOptions = {
    y: { label: measureName, grid: true, domain, nice: false },
    marks: [Plot.ruleY([0])],
  };

  if (xDimension) {
    // Remove hardcoded width for responsive sizing
    const xColumnName = getFieldColumnName(xDimension);
    const categories = Array.from(new Set(data.map((row) => row[xColumnName])));
    const domainKey = xColumnName;
    const sharedDomain = (sharedDomains && (sharedDomains as any)[domainKey]) as any[] | undefined;
    opts.x = { label: xColumnName, domain: (sharedDomain && Array.isArray(sharedDomain) ? sharedDomain : categories) as any, type: 'band' as any, padding: 0.1 as any };
    opts.marginLeft = 0;
    opts.marginRight = 0;
    opts.inset = 0;
    opts.width = Math.max(BAR_STEP_PX * 2, categories.length * BAR_STEP_PX);
    opts.marks!.push(
      Plot.barY(data, { x: xColumnName, y: measureName, fill: colorField ? getFieldColumnName(colorField) : DEFAULT_CHART_COLOR })
    );
  } else {
    // Remove hardcoded width for responsive sizing
    opts.x = { label: ' ' };
    opts.width = BAR_STEP_PX * 2;
    opts.marks!.push(
      Plot.barY(data, { y: measureName, fill: colorField ? getFieldColumnName(colorField) : DEFAULT_CHART_COLOR })
    );
  }

  return opts;
}

function scatterForDimOnly(data: any[], dim: Field, colorField?: Field): Plot.PlotOptions {
  const col = dim.columnName;
  return scatterChart(data, col, col, { x: col, y: col }, colorField);
}

function messageOptions(text: string): Plot.PlotOptions {
  return {
    marks: [Plot.text([text], { frameAnchor: 'middle', fontSize: 12, fill: 'gray' })],
  };
}


