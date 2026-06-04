// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING } from '../../config/chartLayoutConfig';
import { ColorScaleInfo, deriveColorScaleInfo, resolveContextColorChannel } from '../utils/colorSchemeUtils';
import { getFieldDisplayName, getResultColumnName } from '../../utils/fieldUtils';
import { computeBandPaddingFromSizeField } from './barCore';
import { createTooltipFieldsGetter, formatTooltipValue } from '../utils/tooltipUtils';
import { Field, TooltipField } from '../../types';

const BOX_PLOT_COLOR_COLUMN = '__box_plot_color';
const BOX_PLOT_COLOR_MIN_COLUMN = '__box_plot_color_min';
const BOX_PLOT_COLOR_MAX_COLUMN = '__box_plot_color_max';
const BOX_PLOT_COLOR_DISTINCT_COUNT_COLUMN = '__box_plot_color_distinct_count';

type SummaryRow = {
  [key: string]: any;
  count: number;
  min: number | Date;
  q1: number | Date;
  median: number | Date;
  q3: number | Date;
  max: number | Date;
};

type SummaryStat = 'count' | 'min' | 'q1' | 'median' | 'q3' | 'max';

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

function parseContinuousValue(value: any): number | Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return null;
}

function summaryColumnName(valueColumn: string, stat: SummaryStat): string {
  return `${valueColumn}__${stat}`;
}

function hasServerSummaryRows(data: any[], valueColumn: string): boolean {
  const q1Column = summaryColumnName(valueColumn, 'q1');
  const medianColumn = summaryColumnName(valueColumn, 'median');
  return data.some((row) =>
    Object.prototype.hasOwnProperty.call(row, q1Column) &&
    Object.prototype.hasOwnProperty.call(row, medianColumn)
  );
}

function buildSummaryRowsFromRawData(
  data: any[],
  valueColumn: string,
  categoryColumn?: string,
  colorColumn?: string,
): SummaryRow[] {
  const grouped = new Map<any, Array<number | Date>>();
  const groupColors = new Map<any, Set<any>>();

  for (const row of data) {
    const value = row[valueColumn];
    const parsedValue = parseContinuousValue(value);
    if (parsedValue == null) continue;

    const categoryValue = categoryColumn ? row[categoryColumn] : ' ';
    if (!grouped.has(categoryValue)) {
      grouped.set(categoryValue, []);
    }
    grouped.get(categoryValue)!.push(parsedValue);
    if (colorColumn) {
      if (!groupColors.has(categoryValue)) {
        groupColors.set(categoryValue, new Set<any>());
      }
      groupColors.get(categoryValue)!.add(row[colorColumn]);
    }
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
    if (colorColumn) {
      const colors = Array.from(groupColors.get(categoryValue) || []);
      if (colors.length === 1) {
        summary[colorColumn] = colors[0];
      }
    }
    return summary;
  });
}

function buildSummaryRowsFromServerData(
  data: any[],
  valueColumn: string,
  categoryColumn?: string,
  colorColumn?: string,
): SummaryRow[] {
  return data.flatMap((row) => {
    const min = parseContinuousValue(row[summaryColumnName(valueColumn, 'min')]);
    const q1 = parseContinuousValue(row[summaryColumnName(valueColumn, 'q1')]);
    const median = parseContinuousValue(row[summaryColumnName(valueColumn, 'median')]);
    const q3 = parseContinuousValue(row[summaryColumnName(valueColumn, 'q3')]);
    const max = parseContinuousValue(row[summaryColumnName(valueColumn, 'max')]);
    const countValue = row[summaryColumnName(valueColumn, 'count')];
    const count = typeof countValue === 'number' ? countValue : Number(countValue);
    if (min == null || q1 == null || median == null || q3 == null || max == null || !Number.isFinite(count)) {
      return [];
    }

    const summary: SummaryRow = {
      ...row,
      count,
      min,
      q1,
      median,
      q3,
      max,
    };

    if (categoryColumn && !Object.prototype.hasOwnProperty.call(summary, categoryColumn)) {
      summary[categoryColumn] = row[categoryColumn];
    }

    if (colorColumn) {
      const distinctCountRaw = row[BOX_PLOT_COLOR_DISTINCT_COUNT_COLUMN];
      const distinctCount = typeof distinctCountRaw === 'number' ? distinctCountRaw : Number(distinctCountRaw);
      const colorMin = row[BOX_PLOT_COLOR_MIN_COLUMN];
      const colorMax = row[BOX_PLOT_COLOR_MAX_COLUMN];
      if (Number.isFinite(distinctCount) && distinctCount === 1 && colorMin === colorMax) {
        summary[colorColumn] = colorMin;
      }
    }

    return [summary];
  });
}

function buildColorizedRawBoxData(
  data: any[],
  categoryColumn: string | undefined,
  colorColumn: string | undefined,
): { data: any[]; colorColumnName?: string } {
  if (!colorColumn) {
    return { data };
  }

  const groupColors = new Map<any, Set<any>>();
  for (const row of data) {
    const key = categoryColumn ? row[categoryColumn] : ' ';
    if (!groupColors.has(key)) {
      groupColors.set(key, new Set<any>());
    }
    groupColors.get(key)!.add(row[colorColumn]);
  }

  const colorByGroup = new Map<any, any>();
  groupColors.forEach((values, key) => {
    if (values.size === 1) {
      colorByGroup.set(key, Array.from(values)[0]);
    }
  });

  if (colorByGroup.size === 0) {
    return { data };
  }

  return {
    data: data.map((row) => {
      const key = categoryColumn ? row[categoryColumn] : ' ';
      return {
        ...row,
        [BOX_PLOT_COLOR_COLUMN]: colorByGroup.get(key),
      };
    }),
    colorColumnName: BOX_PLOT_COLOR_COLUMN,
  };
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
  colorColumn?: string,
): (row: SummaryRow) => TooltipField[] {
  const valueField = resolveFieldByColumn(context, valueColumn);
  const categoryField = resolveFieldByColumn(context, categoryColumn);
  const tooltipFieldsGetter = createTooltipFieldsGetter(
    categoryColumn && categoryLabel
      ? [{ label: categoryLabel, column: categoryColumn, sourceField: categoryField }]
      : [],
    colorColumn ? context.colorField : undefined,
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

export function boxPlot(
  context: ChartGenerationContext,
  orientation: 'x' | 'y',
  valueColumn: string,
  categoryColumn?: string,
  labels?: { dimension?: string; category?: string },
  axisDomain?: [number, number] | [Date, Date],
  sharedColorScale?: ColorScaleInfo | null,
): Plot.PlotOptions {
  const rawData = context.queryResult.rows;
  const thicknessScale = context.bandThicknessScale ?? 1;
  const bandPadding = computeBandPaddingFromSizeField(rawData, undefined, { manualSize: context.manualSize }) ?? BAND_PADDING;
  const sourceColorColumnName = context.colorField ? getResultColumnName(context.colorField) : undefined;
  const usesDiscreteColor = Boolean(sourceColorColumnName && context.colorField?.flavour === 'discrete');
  const colorized = usesDiscreteColor
    ? buildColorizedRawBoxData(rawData, categoryColumn, sourceColorColumnName)
    : { data: rawData, colorColumnName: undefined as string | undefined };
  const isServerSummaryData = hasServerSummaryRows(rawData, valueColumn);
  const summaryRows = isServerSummaryData
    ? buildSummaryRowsFromServerData(rawData, valueColumn, categoryColumn, sourceColorColumnName)
    : buildSummaryRowsFromRawData(colorized.data, valueColumn, categoryColumn, sourceColorColumnName);
  const resolvedColorColumnName = usesDiscreteColor
    ? (isServerSummaryData ? sourceColorColumnName : colorized.colorColumnName)
    : undefined;
  const colorInfo = usesDiscreteColor && context.colorField
    ? (sharedColorScale || deriveColorScaleInfo(
      summaryRows,
      resolveContextColorChannel(context),
    ))
    : null;
  const categories = categoryColumn
    ? (context.categoryAxisDescriptor?.domain && Array.isArray(context.categoryAxisDescriptor.domain)
        ? context.categoryAxisDescriptor.domain
        : Array.from(new Set(summaryRows.map((row) => row[categoryColumn]))))
    : undefined;
  const categoryCount = Math.max(1, categories?.length ?? 1);
  const categoryAxisSize = Math.max(BAR_STEP_PX, categoryCount * BAR_STEP_PX) * thicknessScale;
  const strokeColor = context.manualColor || DEFAULT_CHART_COLOR;
  const fillColor = context.manualColor || DEFAULT_CHART_COLOR;
  const colorScale = resolvedColorColumnName && colorInfo
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
  const tooltipGetter = createBoxTooltipFieldsGetter(
    context,
    valueColumn,
    labels?.dimension || valueColumn,
    categoryColumn,
    labels?.category,
    sourceColorColumnName,
  );
  const valueDomain = axisDomain || (() => {
    const values = summaryRows.flatMap((row) => [row.min, row.max]);
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
        domainKey: valueColumn,
        ...(valueDomain ? { domain: valueDomain as any, nice: false as any } : {}),
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
        Plot.ruleY(summaryRows, {
          y: categoryColumn || (() => ' '),
          x1: 'min',
          x2: 'max',
          stroke: resolvedColorColumnName || strokeColor,
          strokeWidth: 1.25,
        }),
        Plot.rectX(summaryRows, {
          x1: 'q1',
          x2: 'q3',
          y: categoryColumn || (() => ' '),
          fill: resolvedColorColumnName || fillColor,
          fillOpacity: 0.22,
          stroke: resolvedColorColumnName || strokeColor,
          strokeWidth: 1,
        }),
        Plot.tickX(summaryRows, {
          x: 'min',
          y: categoryColumn || (() => ' '),
          stroke: resolvedColorColumnName || strokeColor,
          strokeWidth: 1,
        }),
        Plot.tickX(summaryRows, {
          x: 'max',
          y: categoryColumn || (() => ' '),
          stroke: resolvedColorColumnName || strokeColor,
          strokeWidth: 1,
        }),
        Plot.tickX(summaryRows, {
          x: 'median',
          y: categoryColumn || (() => ' '),
          stroke: resolvedColorColumnName || strokeColor,
          strokeWidth: 2,
        }),
        ...(valueDomain
          ? [Plot.rectX(summaryRows, {
              x1: valueDomain[0] as any,
              x2: valueDomain[1] as any,
              y: categoryColumn || (() => ' '),
              fill: 'transparent',
              fillOpacity: 0,
              stroke: 'transparent',
            })]
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
      domainKey: valueColumn,
      ...(valueDomain ? { domain: valueDomain as any, nice: false as any } : {}),
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
      Plot.ruleX(summaryRows, {
        x: categoryColumn || (() => ' '),
        y1: 'min',
        y2: 'max',
        stroke: resolvedColorColumnName || strokeColor,
        strokeWidth: 1.25,
      }),
      Plot.rectY(summaryRows, {
        y1: 'q1',
        y2: 'q3',
        x: categoryColumn || (() => ' '),
        fill: resolvedColorColumnName || fillColor,
        fillOpacity: 0.22,
        stroke: resolvedColorColumnName || strokeColor,
        strokeWidth: 1,
      }),
      Plot.tickY(summaryRows, {
        y: 'min',
        x: categoryColumn || (() => ' '),
        stroke: resolvedColorColumnName || strokeColor,
        strokeWidth: 1,
      }),
      Plot.tickY(summaryRows, {
        y: 'max',
        x: categoryColumn || (() => ' '),
        stroke: resolvedColorColumnName || strokeColor,
        strokeWidth: 1,
      }),
      Plot.tickY(summaryRows, {
        y: 'median',
        x: categoryColumn || (() => ' '),
        stroke: resolvedColorColumnName || strokeColor,
        strokeWidth: 2,
      }),
      ...(valueDomain
        ? [Plot.rectY(summaryRows, {
            y1: valueDomain[0] as any,
            y2: valueDomain[1] as any,
            x: categoryColumn || (() => ' '),
            fill: 'transparent',
            fillOpacity: 0,
            stroke: 'transparent',
          })]
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
