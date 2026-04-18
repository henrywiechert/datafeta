import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING } from '../../config/chartLayoutConfig';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { getFieldDisplayName, getResultColumnName } from '../../utils/fieldUtils';
import { computeBandPaddingFromSizeField } from './barCore';

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
  const thicknessScale = context.bandThicknessScale ?? 1;
  const bandPadding = computeBandPaddingFromSizeField(data, undefined, { manualSize: context.manualSize }) ?? BAND_PADDING;
  const colorColumnName = context.colorField ? getResultColumnName(context.colorField) : undefined;
  const usesCategoryColor = Boolean(
    categoryColumn &&
    colorColumnName &&
    context.colorField?.flavour === 'discrete' &&
    colorColumnName === categoryColumn
  );
  const colorInfo = usesCategoryColor && context.colorField
    ? deriveColorScaleInfo(data, context.colorField, context.colorScheme, context.colorBias)
    : null;
  const categories = categoryColumn
    ? (context.categoryAxisDescriptor?.domain && Array.isArray(context.categoryAxisDescriptor.domain)
        ? context.categoryAxisDescriptor.domain
        : Array.from(new Set(data.map((row) => row[categoryColumn]))))
    : undefined;
  const categoryCount = Math.max(1, categories?.length ?? 1);
  const categoryAxisSize = Math.max(BAR_STEP_PX, categoryCount * BAR_STEP_PX) * thicknessScale;
  const strokeColor = context.manualColor || DEFAULT_CHART_COLOR;
  const fillColor = context.manualColor || DEFAULT_CHART_COLOR;
  const colorScale = usesCategoryColor && colorInfo
    ? (colorInfo.kind === 'continuous'
        ? {
            type: 'linear',
            domain: colorInfo.domain as [number, number],
            range: colorInfo.range,
            clamp: true,
            label: getFieldDisplayName(context.colorField!),
          } as any
        : {
            type: 'ordinal' as any,
            domain: colorInfo.domain as any[],
            range: colorInfo.range,
            label: getFieldDisplayName(context.colorField!),
          } as any)
    : undefined;

  const referenceValue = context.boxPlotReferenceLineMode === 'global-median'
    ? getMedianValue(collectContinuousValues(data, valueColumn))
    : null;

  if (orientation === 'x') {
    return {
      ...(colorScale ? { color: colorScale } : {}),
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
              padding: bandPadding as any,
            },
          }
        : {}),
      marks: [
        Plot.boxX(data, {
          x: valueColumn,
          ...(categoryColumn ? { y: categoryColumn } : {}),
          fill: usesCategoryColor ? colorColumnName! : fillColor,
          fillOpacity: 0.22,
          stroke: usesCategoryColor ? colorColumnName! : strokeColor,
        }),
        ...(referenceValue !== null
          ? [Plot.ruleX([referenceValue], { stroke: '#e15759', strokeDasharray: '4,2', strokeWidth: 1.5 })]
          : []),
      ],
      height: categoryAxisSize,
    };
  }

  return {
    ...(colorScale ? { color: colorScale } : {}),
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
            padding: bandPadding as any,
          },
        }
      : {}),
    marks: [
      Plot.boxY(data, {
        y: valueColumn,
        ...(categoryColumn ? { x: categoryColumn } : {}),
        fill: usesCategoryColor ? colorColumnName! : fillColor,
        fillOpacity: 0.22,
        stroke: usesCategoryColor ? colorColumnName! : strokeColor,
      }),
      ...(referenceValue !== null
        ? [Plot.ruleY([referenceValue], { stroke: '#e15759', strokeDasharray: '4,2', strokeWidth: 1.5 })]
        : []),
    ],
    width: categoryAxisSize,
  };
}
