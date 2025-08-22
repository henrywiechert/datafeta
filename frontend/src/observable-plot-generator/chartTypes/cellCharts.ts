import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';
import { lineChart } from './lineChart';
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
  overrides?: ChartTypeOverrides
): Plot.PlotOptions {
  if (!xField && !yField) {
    return messageOptions('No fields');
  }

  // If one side is missing, choose orientation by the present measure
  if (xField && !yField) {
    if (xField.type === 'measure') return createBarX(data, xField, null, sharedMeasureDomains);
    // Single dimension alone → show tick strip would be an alternative, but inside cartesian grid we stick to scatter
    return scatterForDimOnly(data, xField);
  }
  if (!xField && yField) {
    if (yField.type === 'measure') return createBarY(data, yField, null, sharedMeasureDomains);
    return scatterForDimOnly(data, yField);
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
      // Always render scatter (empty when no numeric pairs), to keep base type consistent
      return scatterChart(data, xCol, yCol, domainOptions);
    }
    case 'line': {
      // measure vs continuous dimension – ensure dimension on X axis
      if (xf.type === 'measure' && yf.type === 'dimension') {
        const xCol = yf.columnName;
        const yCol = getResultColumnName({ ...xf, aggregation: xf.aggregation || 'sum' } as any);
        return lineChart(data, xCol, yCol, { x: xCol, y: yCol });
      }
      if (xf.type === 'dimension' && yf.type === 'measure') {
        const xCol = xf.columnName;
        const yCol = getResultColumnName({ ...yf, aggregation: yf.aggregation || 'sum' } as any);
        return lineChart(data, xCol, yCol, { x: xCol, y: yCol });
      }
      // If both are measures or both are dimensions, fallback to scatter (empty if no data)
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      return scatterChart(data, xCol, yCol, { x: xCol, y: yCol });
    }
    case 'barX': {
      return createBarX(data, xf, yf.type === 'dimension' ? yf : null, sharedMeasureDomains);
    }
    case 'barY': {
      return createBarY(data, yf, xf.type === 'dimension' ? xf : null, sharedMeasureDomains);
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
          xDim.columnName,
          category?.columnName
        );
      }
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      return scatterChart(data, xCol, yCol, { x: xCol, y: yCol });
    }
    case 'tickY': {
      // continuous dimension on Y, optional discrete dimension category on X
      const yDim = yf.type === 'dimension' && yf.flavour === 'continuous' ? yf : null;
      const category = xf.type === 'dimension' && xf.flavour === 'discrete' ? xf : null;
      if (yDim) {
        return tickStrip(
          { xFields: [], yFields: [], queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any },
          'y',
          yDim.columnName,
          category?.columnName
        );
      }
      const { xCol, yCol } = resolveXYColumns(xf, yf);
      return scatterChart(data, xCol, yCol, { x: xCol, y: yCol });
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
    : xf.columnName;
  const yCol = yf.type === 'measure'
    ? getResultColumnName({ ...yf, aggregation: yf.aggregation || 'sum' } as any)
    : yf.columnName;
  return { xCol, yCol };
}

function isNumericColumn(data: any[], col: string): boolean {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.some((d) => Number.isFinite(d?.[col]));
}

function createBarX(
  data: any[],
  measure: Field,
  yDimension: Field | null,
  sharedDomains?: Domains
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
    const categories = Array.from(new Set(data.map((row) => row[yDimension.columnName])));
    opts.y = { label: yDimension.columnName, domain: categories as any, type: 'band' as any };
    // Ensure consistent bar thickness regardless of viewport: set fixed padding
    opts.marginTop = 0;
    opts.marginBottom = 0;
    opts.inset = 0;
    opts.height = Math.max(BAR_STEP_PX * 2, categories.length * BAR_STEP_PX);
    opts.marks!.push(
      Plot.barX(data, { x: measureName, y: yDimension.columnName, fill: DEFAULT_CHART_COLOR })
    );
  } else {
    // Remove hardcoded height for responsive sizing
    opts.y = { label: ' ' };
    opts.height = BAR_STEP_PX * 2;
    opts.marks!.push(
      Plot.barX(data, { x: measureName, fill: DEFAULT_CHART_COLOR })
    );
  }

  return opts;
}

function createBarY(
  data: any[],
  measure: Field,
  xDimension: Field | null,
  sharedDomains?: Domains
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
    const categories = Array.from(new Set(data.map((row) => row[xDimension.columnName])));
    opts.x = { label: xDimension.columnName, domain: categories as any, type: 'band' as any };
    opts.marginLeft = 0;
    opts.marginRight = 0;
    opts.inset = 0;
    opts.width = Math.max(BAR_STEP_PX * 2, categories.length * BAR_STEP_PX);
    opts.marks!.push(
      Plot.barY(data, { x: xDimension.columnName, y: measureName, fill: DEFAULT_CHART_COLOR })
    );
  } else {
    // Remove hardcoded width for responsive sizing
    opts.x = { label: ' ' };
    opts.width = BAR_STEP_PX * 2;
    opts.marks!.push(
      Plot.barY(data, { y: measureName, fill: DEFAULT_CHART_COLOR })
    );
  }

  return opts;
}

function scatterForDimOnly(data: any[], dim: Field): Plot.PlotOptions {
  const col = dim.columnName;
  return scatterChart(data, col, col, { x: col, y: col });
}

function messageOptions(text: string): Plot.PlotOptions {
  return {
    marks: [Plot.text([text], { frameAnchor: 'middle', fontSize: 12, fill: 'gray' })],
  };
}


