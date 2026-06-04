// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Cell Chart Helpers
 * Utility functions for cell chart generation
 */

import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { scatterChart } from './scatterChart';
import { ChartContext } from './cellChartTypes';

/**
 * Aggregate numeric values from data using the specified aggregation function.
 * Handles sum, count, count_distinct, min, max, avg.
 */
export function aggregateValues(
  data: any[],
  column: string,
  aggregation?: string
): number {
  const values = (Array.isArray(data) ? data : [])
    .map((d) => d?.[column])
    .filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
  
  if (values.length === 0) return 0;
  
  const agg = (aggregation || 'sum').toLowerCase();
  switch (agg) {
    case 'sum':
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
      // Fallback to simple mean across groups (not weighted)
      return values.reduce((s, v) => s + v, 0) / values.length;
    default:
      return values.reduce((s, v) => s + v, 0);
  }
}

/**
 * Resolve column names for X and Y fields, handling measure aggregation aliases.
 */
export function resolveXYColumns(xf: Field, yf: Field): { xCol: string; yCol: string } {
  const xCol = xf.type === 'measure'
    ? getResultColumnName({ ...xf, aggregation: xf.aggregation || 'sum' } as any)
    : getResultColumnName(xf);
  const yCol = yf.type === 'measure'
    ? getResultColumnName({ ...yf, aggregation: yf.aggregation || 'sum' } as any)
    : getResultColumnName(yf);
  return { xCol, yCol };
}

/**
 * Create a message-only plot (for error/empty states).
 */
export function messageOptions(text: string): Plot.PlotOptions {
  return {
    marks: [Plot.text([text], { frameAnchor: 'middle', fontSize: 12, fill: 'gray' })],
  };
}

/**
 * Fallback scatter for dimension-only case.
 */
export function scatterForDimOnly(
  data: any[],
  dim: Field,
  ctx: ChartContext
): Plot.PlotOptions {
  const col = dim.columnName;
  return scatterChart(
    data, col, col, { x: col, y: col },
    ctx.color,
    ctx.sizeField, ctx.sizeRange, ctx.manualSize, ctx.sizeScaleData,
    undefined, ctx.tooltipFields, ctx.facetFields, undefined, ctx.manualShape
  );
}

/**
 * Resolve the actual column name in data, handling aggregation aliases.
 * The query may return raw column name or aggregated alias (e.g., "dur" vs "SUM(dur)").
 */
export function resolveColumnInData(data: any[], field: Field): string {
  const rawName = field.columnName;
  const aggName = getResultColumnName(field);
  
  // Check if aggregated alias exists in data first (preferred)
  if (data.length > 0 && Object.prototype.hasOwnProperty.call(data[0], aggName)) {
    return aggName;
  }
  // Fall back to raw column name
  if (data.length > 0 && Object.prototype.hasOwnProperty.call(data[0], rawName)) {
    return rawName;
  }
  // Default to aggregated name (let it fail gracefully downstream)
  return aggName;
}
