import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';

function getMedianValue(values: Array<number | Date>): number | Date | null {
  if (values.length === 0) return null;

  const numericValues = values
    .map((value) => value instanceof Date ? value.getTime() : value)
    .sort((left, right) => left - right);

  const middleIndex = Math.floor(numericValues.length / 2);
  const median = numericValues.length % 2 === 0
    ? (numericValues[middleIndex - 1] + numericValues[middleIndex]) / 2
    : numericValues[middleIndex];

  return values[0] instanceof Date ? new Date(median) : median;
}

function collectContinuousValues(data: any[], valueColumn: string): Array<number | Date> {
  return data.reduce<Array<number | Date>>((values, row) => {
    const value = row[valueColumn];
    if (typeof value === 'number' && Number.isFinite(value)) {
      values.push(value);
      return values;
    }
    if (value instanceof Date) {
      values.push(value);
      return values;
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        values.push(new Date(parsed));
      }
    }
    return values;
  }, []);
}

export function boxPlot(
  context: ChartGenerationContext,
  orientation: 'x' | 'y',
  valueColumn: string,
  categoryColumn?: string,
  labels?: { dimension?: string; category?: string },
  axisDomain?: [number, number] | [Date, Date],
): Plot.PlotOptions {
  const data = context.queryResult.rows;
  const categories = categoryColumn
    ? (context.categoryAxisDescriptor?.domain && Array.isArray(context.categoryAxisDescriptor.domain)
        ? context.categoryAxisDescriptor.domain
        : Array.from(new Set(data.map((row) => row[categoryColumn]))))
    : undefined;
  const categoryCount = Math.max(1, categories?.length ?? 1);
  const categoryAxisSize = Math.max(BAR_STEP_PX, categoryCount * BAR_STEP_PX);
  const strokeColor = context.manualColor || DEFAULT_CHART_COLOR;
  const fillColor = context.manualColor || DEFAULT_CHART_COLOR;

  const referenceValue = context.boxPlotReferenceLineMode === 'global-median'
    ? getMedianValue(collectContinuousValues(data, valueColumn))
    : null;

  if (orientation === 'x') {
    return {
      x: {
        label: labels?.dimension || valueColumn,
        grid: true,
        ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}),
      } as any,
      ...(categoryColumn
        ? {
            y: {
              label: labels?.category,
              domain: categories as any,
              type: 'band' as any,
            },
          }
        : {}),
      marks: [
        Plot.boxX(data, {
          x: valueColumn,
          ...(categoryColumn ? { y: categoryColumn } : {}),
          fill: fillColor,
          fillOpacity: 0.22,
          stroke: strokeColor,
        }),
        ...(referenceValue !== null
          ? [Plot.ruleX([referenceValue], { stroke: '#e15759', strokeDasharray: '4,2', strokeWidth: 1.5 })]
          : []),
      ],
      height: categoryAxisSize,
    };
  }

  return {
    y: {
      label: labels?.dimension || valueColumn,
      grid: true,
      ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}),
    } as any,
    ...(categoryColumn
      ? {
          x: {
            label: labels?.category,
            domain: categories as any,
            type: 'band' as any,
          },
        }
      : {}),
    marks: [
      Plot.boxY(data, {
        y: valueColumn,
        ...(categoryColumn ? { x: categoryColumn } : {}),
        fill: fillColor,
        fillOpacity: 0.22,
        stroke: strokeColor,
      }),
      ...(referenceValue !== null
        ? [Plot.ruleY([referenceValue], { stroke: '#e15759', strokeDasharray: '4,2', strokeWidth: 1.5 })]
        : []),
    ],
    width: categoryAxisSize,
  };
}
