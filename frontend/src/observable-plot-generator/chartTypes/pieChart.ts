// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { Field, TooltipField } from '../../types';
import { getFieldDisplayName, getResultColumnName } from '../../utils/fieldUtils';
import { DEFAULT_CHART_COLOR } from '../../config/chartLayoutConfig';
import { ChartGenerationContext, PiePlotSpec, PlotResult, SharedDomains } from '../types';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';
import { buildLabelStringFromFields } from '../utils/labelUtils';
import { FacetPlan, planFacets } from '../faceting/facetPlanner';
import { coordinateFacetedGrid, CellGenerator, CellResult, FacetCellContext } from '../faceting/facetCoordinator';

const PIE_CELL_SIZE = 260;
const MIN_PIE_CELL_SIZE = 120;
const ZERO_EPSILON = 1e-12;

function createMessageChart(message: string): PlotResult {
  return {
    library: 'observable-plot',
    plots: [{
      id: 'pie-message',
      title: '',
      options: {
        marks: [
          Plot.text([message], {
            frameAnchor: 'middle',
            fontSize: 14,
            fill: 'gray',
          }),
        ],
      },
      position: { row: 0, col: 0 },
    }],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr'],
    },
  };
}

function resolveMeasureFields(context: ChartGenerationContext): Field[] {
  return [...context.xFields, ...context.yFields]
    .filter((field) => field.type === 'measure');
}

function resolveMeasureLayout(context: ChartGenerationContext): {
  fields: Field[];
  orientation: 'horizontal' | 'vertical';
} {
  const xMeasures = context.xFields.filter((field) => field.type === 'measure');
  const yMeasures = context.yFields.filter((field) => field.type === 'measure');

  if (xMeasures.length > 0 && yMeasures.length === 0) {
    return { fields: xMeasures, orientation: 'horizontal' };
  }

  if (yMeasures.length > 0 && xMeasures.length === 0) {
    return { fields: yMeasures, orientation: 'vertical' };
  }

  return { fields: [...xMeasures, ...yMeasures], orientation: 'horizontal' };
}

function resolveColumn(rows: any[], field: Field): string {
  const withDefaultAgg = field.type === 'measure'
    ? { ...field, aggregation: field.aggregation || 'sum' } as Field
    : field;
  const resultColumn = getResultColumnName(withDefaultAgg);
  if (rows.length > 0 && Object.prototype.hasOwnProperty.call(rows[0], resultColumn)) {
    return resultColumn;
  }
  return field.columnName;
}

function toFiniteNumber(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  if (typeof value === 'string') {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  return null;
}

function valueKey(value: any): string {
  if (value instanceof Date) return `date:${value.valueOf()}`;
  return `${typeof value}:${String(value)}`;
}

function getColorForValue(value: any, colorScale: SharedDomains['colorScale']): string {
  if (!colorScale || colorScale.kind !== 'categorical') {
    return '#4e79a7';
  }
  const domain = colorScale.domain as any[];
  const range = colorScale.range;
  const index = domain.findIndex((candidate) => valueKey(candidate) === valueKey(value));
  const safeIndex = index >= 0 ? index : 0;
  return range[safeIndex % range.length] || '#4e79a7';
}

function aggregatePositiveValue(rows: any[], column: string): number {
  return rows.reduce((total, row) => {
    const value = toFiniteNumber(row?.[column]);
    return value !== null && value > ZERO_EPSILON ? total + value : total;
  }, 0);
}

function getValueSignMode(rows: any[], column: string): 'positive' | 'negative' | 'mixed' | 'empty' {
  let hasPositive = false;
  let hasNegative = false;

  for (const row of rows) {
    const value = toFiniteNumber(row?.[column]);
    if (value === null || Math.abs(value) <= ZERO_EPSILON) continue;
    if (value > 0) hasPositive = true;
    if (value < 0) hasNegative = true;
    if (hasPositive && hasNegative) return 'mixed';
  }

  if (hasPositive) return 'positive';
  if (hasNegative) return 'negative';
  return 'empty';
}

function toPieMagnitude(value: number | null, signMode: 'positive' | 'negative'): number | null {
  if (value === null || Math.abs(value) <= ZERO_EPSILON) return null;
  if (signMode === 'negative') return value < 0 ? Math.abs(value) : null;
  return value > 0 ? value : null;
}

export function getPieRadiusMetric(rows: any[], context: ChartGenerationContext): number {
  if (!context.sizeField) return 1;
  const sizeColumn = resolveColumn(rows, context.sizeField);
  const metric = aggregatePositiveValue(rows, sizeColumn);
  return metric > 0 ? metric : 1;
}

function buildTooltipFields(args: {
  row: any;
  context: ChartGenerationContext;
  measureField: Field;
  measureColumn: string;
  colorField?: Field;
  colorColumn?: string;
  value: number;
  percentage: number;
  facetFields: Field[];
}): TooltipField[] {
  const {
    row,
    context,
    measureField,
    measureColumn,
    colorField,
    colorColumn,
    value,
    percentage,
    facetFields,
  } = args;

  const fields: TooltipField[] = [];

  if (colorField && colorColumn) {
    fields.push({
      label: getFieldDisplayName(colorField, context.fieldAliasLookup),
      value: String(row?.[colorColumn] ?? ''),
      sourceField: colorField,
      rawValue: row?.[colorColumn],
    });
  }

  fields.push(
    {
      label: getFieldDisplayName(measureField, context.fieldAliasLookup),
      value,
      rawValue: value,
      sourceField: measureField,
    },
    {
      label: 'Share',
      value: `${(percentage * 100).toFixed(1)}%`,
      rawValue: percentage,
    },
  );

  for (const facetField of facetFields) {
    const column = resolveColumn([row], facetField);
    fields.push({
      label: getFieldDisplayName(facetField, context.fieldAliasLookup),
      value: String(row?.[column] ?? ''),
      sourceField: facetField,
      rawValue: row?.[column],
    });
  }

  if (context.tooltipFields?.length) {
    const getTooltipFields = createTooltipFieldsGetter(
      [],
      undefined,
      undefined,
      context.tooltipFields,
      [measureColumn, ...(colorColumn ? [colorColumn] : [])],
      [],
    );
    fields.push(...getTooltipFields(row));
  }

  return fields;
}

function buildSliceLabelLines(row: any, context: ChartGenerationContext, percentage: number): string[] {
  const lines = [`${(percentage * 100).toFixed(1)}%`];
  if (context.labelFields?.length) {
    const labelText = buildLabelStringFromFields(row, context.labelFields);
    if (labelText) {
      lines.push(...labelText.split('\n').filter(Boolean));
    }
  }
  return lines;
}

export function buildPiePlotSpec(args: {
  rows: any[];
  context: ChartGenerationContext;
  sharedDomains: SharedDomains;
  facetFields?: Field[];
  measureField?: Field;
}): PiePlotSpec {
  const { rows, context, sharedDomains, facetFields = [], measureField: explicitMeasureField } = args;
  const measureField = explicitMeasureField || resolveMeasureFields(context)[0];
  const colorField = context.colorField?.flavour === 'discrete' ? context.colorField : undefined;

  if (!measureField) {
    return {
      slices: [],
      total: 0,
      measureLabel: '',
      colorLabel: '',
      radiusScale: 1,
      emptyMessage: 'Pie charts need at least one measure on X or Y.',
    };
  }

  const measureColumn = resolveColumn(rows, measureField);
  const colorColumn = colorField ? resolveColumn(rows, colorField) : undefined;
  const grouped = new Map<string, { rawValue: any; value: number; row: any }>();
  const signMode = getValueSignMode(rows, measureColumn);

  if (signMode === 'mixed') {
    return {
      slices: [],
      total: 0,
      measureLabel: getFieldDisplayName(measureField, context.fieldAliasLookup),
      colorLabel: colorField ? getFieldDisplayName(colorField, context.fieldAliasLookup) : '',
      radiusScale: 1,
      emptyMessage: 'Pie charts cannot mix positive and negative values. Use a bar chart for signed measures.',
    };
  }

  if (colorField && colorColumn) {
    for (const row of rows) {
      const rawValue = row?.[colorColumn];
      const value = toPieMagnitude(toFiniteNumber(row?.[measureColumn]), signMode === 'negative' ? 'negative' : 'positive');
      if (value === null) continue;
      const key = valueKey(rawValue);
      const existing = grouped.get(key);
      if (existing) {
        existing.value += value;
      } else {
        grouped.set(key, { rawValue, value, row });
      }
    }
  } else {
    const totalValue = rows.reduce((total, row) => {
      const value = toPieMagnitude(toFiniteNumber(row?.[measureColumn]), signMode === 'negative' ? 'negative' : 'positive');
      return value !== null ? total + value : total;
    }, 0);
    if (totalValue > 0) {
      grouped.set('__single__', { rawValue: 'Total', value: totalValue, row: rows[0] || {} });
    }
  }

  const colorScale = colorField
    ? sharedDomains.colorScale || deriveColorScaleInfo(
        context.queryResult.rows,
        colorField,
        context.colorScheme,
        context.colorBias,
        context.colorReversed,
      )
    : null;

  const entries = Array.from(grouped.values()).sort((a, b) =>
    String(a.rawValue ?? '').localeCompare(String(b.rawValue ?? ''), undefined, { numeric: true, sensitivity: 'base' })
  );
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);

  if (total <= 0) {
    return {
      slices: [],
      total: 0,
      measureLabel: getFieldDisplayName(measureField, context.fieldAliasLookup),
      colorLabel: colorField ? getFieldDisplayName(colorField, context.fieldAliasLookup) : '',
      radiusScale: 1,
      emptyMessage: 'No positive values available for pie slices.',
    };
  }

  const maxRadiusMetric = getPieRadiusMetric(context.queryResult.rows, context);
  const radiusMetric = getPieRadiusMetric(rows, context);
  const sizeRatio = maxRadiusMetric > 0 ? Math.sqrt(radiusMetric / maxRadiusMetric) : 1;
  const manualRatio = Math.max(0.25, Math.min(1, (context.manualSize ?? 40) / 40));
  const radiusScale = Math.max(0.2, Math.min(1, sizeRatio * manualRatio));

  const slices = entries.map((entry) => {
    const percentage = entry.value / total;
    const label = colorField ? String(entry.rawValue ?? '') : 'Total';
    return {
      id: valueKey(entry.rawValue),
      label,
      rawValue: entry.rawValue,
      value: entry.value,
      percentage,
      color: colorField ? getColorForValue(entry.rawValue, colorScale) : (context.manualColor || DEFAULT_CHART_COLOR),
      labelLines: buildSliceLabelLines(entry.row, context, percentage),
      tooltipFields: buildTooltipFields({
        row: entry.row,
        context,
        measureField,
        measureColumn,
        colorField,
        colorColumn,
        value: entry.value,
        percentage,
        facetFields,
      }),
    };
  });

  return {
    slices,
    total,
    measureLabel: getFieldDisplayName(measureField, context.fieldAliasLookup),
    colorLabel: colorField ? getFieldDisplayName(colorField, context.fieldAliasLookup) : '',
    radiusScale,
  };
}

function createPieCellGenerator(context: ChartGenerationContext): CellGenerator {
  return (
    cellData: any[],
    _cellContext: ChartGenerationContext,
    sharedDomains: SharedDomains,
    _facetPosition: { row: number; col: number },
    facetCellContext?: FacetCellContext
  ): CellResult => {
    const facetFields = facetCellContext
      ? [...facetCellContext.rowFacetFields, ...facetCellContext.colFacetFields]
      : [];
    const measureLayout = resolveMeasureLayout(context);
    const measureFields = measureLayout.fields;
    const plots = measureFields.map((measureField, index) => {
      const pieSpec = buildPiePlotSpec({
        rows: cellData,
        context,
        sharedDomains,
        facetFields,
        measureField,
      });

      return {
        id: `pie-${measureField.id || index}`,
        title: pieSpec.measureLabel,
        options: {
          __customTooltip: {
            enabled: true,
            getFields: () => [],
          },
          __hideExternalAxes: true,
        } as any,
        renderer: 'pie-svg' as const,
        pieSpec,
        position: measureLayout.orientation === 'vertical'
          ? { row: index, col: 0 }
          : { row: 0, col: index },
      };
    });

    const columns = measureLayout.orientation === 'vertical' ? 1 : Math.max(1, measureFields.length);
    const rows = measureLayout.orientation === 'vertical' ? Math.max(1, measureFields.length) : 1;

    return {
      plots,
      columns,
      rows,
      columnSizes: Array.from({ length: columns }, () => PIE_CELL_SIZE),
      rowSizes: Array.from({ length: rows }, () => PIE_CELL_SIZE),
      minColumnSizes: Array.from({ length: columns }, () => MIN_PIE_CELL_SIZE),
      minRowSizes: Array.from({ length: rows }, () => MIN_PIE_CELL_SIZE),
    };
  };
}

function generateSinglePieGrid(context: ChartGenerationContext, sharedDomains: SharedDomains): PlotResult {
  const cell = createPieCellGenerator(context)(
    context.queryResult.rows,
    context,
    sharedDomains,
    { row: 0, col: 0 },
  );

  return {
    library: 'observable-plot',
    plots: cell.plots,
    layout: {
      type: 'grid',
      columns: cell.columns,
      rows: cell.rows,
      columnSizes: cell.columnSizes || ['fr'],
      rowSizes: cell.rowSizes || ['fr'],
      minColumnSizes: cell.minColumnSizes,
      minRowSizes: cell.minRowSizes,
    },
  };
}

function pieFacetPlan(context: ChartGenerationContext): FacetPlan | null {
  const plan = planFacets(context);
  if (!plan) return null;
  return {
    rowFacetFields: plan.rowFacetFields,
    colFacetFields: plan.colFacetFields,
  };
}

export function generatePieGrid(context: ChartGenerationContext): PlotResult {
  const measureFields = resolveMeasureFields(context);
  if (measureFields.length === 0) {
    return createMessageChart('Pie charts need at least one measure on X or Y.');
  }

  const plan = pieFacetPlan(context);
  const sharedDomains: SharedDomains = {
    measure: {},
    numeric: {},
    categorical: {},
    colorScale: context.colorField?.flavour === 'discrete'
      ? deriveColorScaleInfo(
          context.queryResult.rows,
          context.colorField,
          context.colorScheme,
          context.colorBias,
          context.colorReversed,
        )
      : null,
  };

  if (plan && (plan.rowFacetFields.length > 0 || plan.colFacetFields.length > 0)) {
    return coordinateFacetedGrid({
      context,
      plan,
      cellGenerator: createPieCellGenerator(context),
    });
  }

  return generateSinglePieGrid(context, sharedDomains);
}
