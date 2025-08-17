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
      const xIsNumeric = isNumericColumn(data, xCol);
      const yIsNumeric = isNumericColumn(data, yCol);
      if (xIsNumeric && yIsNumeric) {
        return scatterChart(data, xCol, yCol, { x: xCol, y: yCol });
      }
      // Fallback: if only one axis is numeric, use tick-strip on that axis and categorize by the other
      if (xIsNumeric && !yIsNumeric) {
        const categoryCol = yf.type === 'dimension' ? yf.columnName : undefined;
        return tickStrip(
          { xFields: [], yFields: [], queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any },
          'x',
          xCol,
          categoryCol
        );
      }
      if (!xIsNumeric && yIsNumeric) {
        const categoryCol = xf.type === 'dimension' ? xf.columnName : undefined;
        return tickStrip(
          { xFields: [], yFields: [], queryResult: { columns: [], rows: data, row_count: data?.length || 0 } as any },
          'y',
          yCol,
          categoryCol
        );
      }
      // Neither axis numeric → categorical dot plot if both dimensions, otherwise message
      if (xf.type === 'dimension' && yf.type === 'dimension') {
        return {
          x: { label: xCol },
          y: { label: yCol },
          marks: [Plot.dot(data, { x: xCol, y: yCol, fill: DEFAULT_CHART_COLOR, r: 2 })],
        };
      }
      return messageOptions('Unsupported combination');
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
      // If both are measures or both are dimensions, fallback to scatter
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
  const domain = (sharedDomains && sharedDomains[measureName]) || undefined;

  const opts: Plot.PlotOptions = {
    x: { label: measureName, grid: true, domain },
    marks: [Plot.ruleX([0])],
  };

  if (yDimension) {
    const categoryCount = new Set(data.map((row: any) => row[yDimension.columnName])).size;
    opts.height = Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX);
    opts.y = { label: yDimension.columnName };
    opts.marks!.push(
      Plot.barX(data, { x: measureName, y: yDimension.columnName, fill: DEFAULT_CHART_COLOR })
    );
  } else {
    opts.height = BAR_STEP_PX * 2;
    opts.y = { label: ' ' };
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
  const domain = (sharedDomains && sharedDomains[measureName]) || undefined;

  const opts: Plot.PlotOptions = {
    y: { label: measureName, grid: true, domain },
    marks: [Plot.ruleY([0])],
  };

  if (xDimension) {
    const categoryCount = new Set(data.map((row: any) => row[xDimension.columnName])).size;
    opts.width = Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX);
    opts.x = { label: xDimension.columnName };
    opts.marks!.push(
      Plot.barY(data, { x: xDimension.columnName, y: measureName, fill: DEFAULT_CHART_COLOR })
    );
  } else {
    opts.width = BAR_STEP_PX * 2;
    opts.x = { label: ' ' };
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


