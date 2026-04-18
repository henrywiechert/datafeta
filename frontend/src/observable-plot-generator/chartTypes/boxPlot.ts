import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING } from '../../config/chartLayoutConfig';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { getFieldDisplayName, getResultColumnName } from '../../utils/fieldUtils';
import { computeBandPaddingFromSizeField } from './barCore';
import { createTooltipFieldsGetter, formatTooltipValue } from '../utils/tooltipUtils';
import { Field, TooltipField } from '../../types';

type SummaryRow = {
  [key: string]: any;
  count: number;
  min: number | Date;
  q1: number | Date;
  median: number | Date;
  q3: number | Date;
  max: number | Date;
};

function quantile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return NaN;
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  const weight = position - lowerIndex;
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

function toTooltipValue(sampleValue: number | Date, numericValue: number): number | Date {
  return sampleValue instanceof Date ? new Date(numericValue) : numericValue;
}

function buildSummaryRows(data: any[], valueColumn: string, categoryColumn?: string): SummaryRow[] {
  const grouped = new Map<any, Array<number | Date>>();

  for (const row of data) {
    const value = row[valueColumn];
    let parsedValue: number | Date | null = null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      parsedValue = value;
    } else if (value instanceof Date) {
      parsedValue = value;
    } else if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) parsedValue = new Date(parsed);
    }
    if (parsedValue == null) continue;

    const categoryValue = categoryColumn ? row[categoryColumn] : ' ';
    if (!grouped.has(categoryValue)) {
      grouped.set(categoryValue, []);
    }
    grouped.get(categoryValue)!.push(parsedValue);
  }

  return Array.from(grouped.entries()).map(([categoryValue, values]) => {
    const numericValues = values
      .map((value) => value instanceof Date ? value.getTime() : value)
      .sort((left, right) => left - right);
    const sample = values[0];
    const summary: SummaryRow = {
      count: numericValues.length,
      min: toTooltipValue(sample, numericValues[0]),
      q1: toTooltipValue(sample, quantile(numericValues, 0.25)),
      median: toTooltipValue(sample, quantile(numericValues, 0.5)),
      q3: toTooltipValue(sample, quantile(numericValues, 0.75)),
      max: toTooltipValue(sample, numericValues[numericValues.length - 1]),
    };
    if (categoryColumn) {
      summary[categoryColumn] = categoryValue;
    }
    return summary;
  });
}

function resolveFieldByColumn(context: ChartGenerationContext, columnName?: string): Field | undefined {
  if (!columnName) return undefined;
  const candidates = [
    ...context.xFields,
    ...context.yFields,
    ...(context.colorField ? [context.colorField] : []),
    ...(context.tooltipFields || []),
  ];
  return candidates.find((field) => getResultColumnName(field) === columnName || field.columnName === columnName);
}

function createBoxTooltipFieldsGetter(
  context: ChartGenerationContext,
  valueColumn: string,
  valueLabel: string,
  categoryColumn?: string,
  categoryLabel?: string,
): (row: SummaryRow) => TooltipField[] {
  const valueField = resolveFieldByColumn(context, valueColumn);
  const categoryField = resolveFieldByColumn(context, categoryColumn);
  const tooltipFieldsGetter = createTooltipFieldsGetter(
    categoryColumn && categoryLabel
      ? [{ label: categoryLabel, column: categoryColumn, sourceField: categoryField }]
      : [],
    undefined,
    undefined,
    undefined,
  );

  return (row: SummaryRow) => {
    const fields = tooltipFieldsGetter(row);
    fields.push(
      {
        label: `${valueLabel} min`,
        value: formatTooltipValue(row.min),
        formattedValue: formatTooltipValue(row.min),
        sourceField: valueField,
        rawValue: row.min,
      },
      {
        label: `${valueLabel} Q1`,
        value: formatTooltipValue(row.q1),
        formattedValue: formatTooltipValue(row.q1),
        sourceField: valueField,
        rawValue: row.q1,
      },
      {
        label: `${valueLabel} median`,
        value: formatTooltipValue(row.median),
        formattedValue: formatTooltipValue(row.median),
        sourceField: valueField,
        rawValue: row.median,
      },
      {
        label: `${valueLabel} Q3`,
        value: formatTooltipValue(row.q3),
        formattedValue: formatTooltipValue(row.q3),
        sourceField: valueField,
        rawValue: row.q3,
      },
      {
        label: `${valueLabel} max`,
        value: formatTooltipValue(row.max),
        formattedValue: formatTooltipValue(row.max),
        sourceField: valueField,
        rawValue: row.max,
      },
      {
        label: 'Count',
        value: row.count,
        formattedValue: formatTooltipValue(row.count),
        rawValue: row.count,
      }
    );
    return fields;
  };
}

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
  const summaryRows = buildSummaryRows(data, valueColumn, categoryColumn);
  const tooltipGetter = createBoxTooltipFieldsGetter(
    context,
    valueColumn,
    labels?.dimension || valueColumn,
    categoryColumn,
    labels?.category,
  );
  const interactionDomain = axisDomain || (() => {
    const values = collectContinuousValues(data, valueColumn);
    if (values.length === 0) return undefined;
    const numericValues = values.map((value) => value instanceof Date ? value.getTime() : value);
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    return values[0] instanceof Date ? [new Date(min), new Date(max)] as [Date, Date] : [min, max] as [number, number];
  })();

  if (orientation === 'x') {
    const options: Plot.PlotOptions = {
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
        : {
            y: {
              label: ' ',
              domain: [' '] as any,
              type: 'band' as any,
              padding: bandPadding as any,
            },
          }),
      marks: [
        Plot.boxX(data, {
          x: valueColumn,
          y: categoryColumn || (() => ' '),
          fill: usesCategoryColor ? colorColumnName! : fillColor,
          fillOpacity: 0.22,
          stroke: usesCategoryColor ? colorColumnName! : strokeColor,
        }),
        ...(interactionDomain
          ? [Plot.rectX(summaryRows, {
              x1: interactionDomain[0] as any,
              x2: interactionDomain[1] as any,
              y: categoryColumn || (() => ' '),
              fill: 'transparent',
              fillOpacity: 0,
              stroke: 'transparent',
            })]
          : []),
        ...(referenceValue !== null
          ? [Plot.ruleX([referenceValue], { stroke: '#e15759', strokeDasharray: '4,2', strokeWidth: 1.5 })]
          : []),
      ],
      height: categoryAxisSize,
    };
    (options as any).__customTooltip = {
      enabled: true,
      data: summaryRows,
      getFields: tooltipGetter,
    };
    return options;
  }

  const options: Plot.PlotOptions = {
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
      : {
          x: {
            label: ' ',
            domain: [' '] as any,
            type: 'band' as any,
            padding: bandPadding as any,
          },
        }),
    marks: [
      Plot.boxY(data, {
        y: valueColumn,
        x: categoryColumn || (() => ' '),
        fill: usesCategoryColor ? colorColumnName! : fillColor,
        fillOpacity: 0.22,
        stroke: usesCategoryColor ? colorColumnName! : strokeColor,
      }),
      ...(interactionDomain
        ? [Plot.rectY(summaryRows, {
            y1: interactionDomain[0] as any,
            y2: interactionDomain[1] as any,
            x: categoryColumn || (() => ' '),
            fill: 'transparent',
            fillOpacity: 0,
            stroke: 'transparent',
          })]
        : []),
      ...(referenceValue !== null
        ? [Plot.ruleY([referenceValue], { stroke: '#e15759', strokeDasharray: '4,2', strokeWidth: 1.5 })]
        : []),
    ],
    width: categoryAxisSize,
  };
  (options as any).__customTooltip = {
    enabled: true,
    data: summaryRows,
    getFields: tooltipGetter,
  };
  return options;
}
