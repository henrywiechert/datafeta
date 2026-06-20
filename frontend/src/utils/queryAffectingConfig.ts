// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, FilterConfig, FieldOverrideState, UserChartType, DistributionVariant, LineVariant, LineColorMode } from '../types';

export interface QueryAffectingConfig {
  xAxisFields: Field[];
  yAxisFields: Field[];
  appliedFilterConfigurations: Record<string, FilterConfig>;
  colorField: Field | null;
  sizeField: Field | null;
  shapeField?: Field | null;
  facetBackgroundField?: Field | null;
  labelFields?: Field[];
  tooltipFields?: Field[];
  measureGroupFields?: Field[];
}

export interface ChartAffectingConfig extends QueryAffectingConfig {
  colorScheme?: string;
  colorBias?: number;
  colorReversed?: boolean;
  manualColor?: string;
  manualShape?: string;
  sizeRange?: [number, number];
  manualSize?: number;
  bandThicknessScale?: number;
  fieldOverrides?: Record<string, FieldOverrideState>;
  globalChartType?: UserChartType | null;
  lineVariant?: LineVariant;
  areaFillOpacity?: number;
  lineColorMode?: LineColorMode;
  distributionVariant?: DistributionVariant;
  /** Per-sheet pager state for the 'table-refactor' chart type (0-based index). */
  tablePage?: number;
  /** Global user setting controlling rows per page for 'table-refactor'. */
  tablePageSize?: number;
  independentDomains?: { x?: boolean; y?: boolean };
  labelsEnabled?: boolean;
  labelSamplingStrategy?: string;
  labelSamplingThreshold?: number;
  labelSampleEvery?: number;
}

export type QueryAffectingSingleFieldKey =
  | 'colorField'
  | 'sizeField'
  | 'shapeField'
  | 'facetBackgroundField';

export function createQueryAffectingConfig(config: QueryAffectingConfig): QueryAffectingConfig {
  return {
    xAxisFields: config.xAxisFields,
    yAxisFields: config.yAxisFields,
    appliedFilterConfigurations: config.appliedFilterConfigurations,
    colorField: config.colorField,
    sizeField: config.sizeField,
    shapeField: config.shapeField ?? null,
    facetBackgroundField: config.facetBackgroundField ?? null,
    labelFields: config.labelFields ?? [],
    tooltipFields: config.tooltipFields ?? [],
    measureGroupFields: config.measureGroupFields ?? [],
  };
}

export function createChartAffectingConfig(config: ChartAffectingConfig): ChartAffectingConfig {
  return {
    ...createQueryAffectingConfig(config),
    colorScheme: config.colorScheme,
    colorBias: config.colorBias,
    colorReversed: config.colorReversed,
    manualColor: config.manualColor,
    manualShape: config.manualShape,
    sizeRange: config.sizeRange,
    manualSize: config.manualSize,
    bandThicknessScale: config.bandThicknessScale,
    fieldOverrides: config.fieldOverrides,
    globalChartType: config.globalChartType,
    lineVariant: config.lineVariant,
    areaFillOpacity: config.areaFillOpacity,
    lineColorMode: config.lineColorMode,
    distributionVariant: config.distributionVariant,
    tablePage: config.tablePage,
    tablePageSize: config.tablePageSize,
    independentDomains: config.independentDomains,
    labelsEnabled: config.labelsEnabled,
    labelSamplingStrategy: config.labelSamplingStrategy,
    labelSamplingThreshold: config.labelSamplingThreshold,
    labelSampleEvery: config.labelSampleEvery,
  };
}

export function getQueryAffectingSingleFields(
  config: QueryAffectingConfig,
): Array<{ key: QueryAffectingSingleFieldKey; field: Field }> {
  const singleFields: Array<{ key: QueryAffectingSingleFieldKey; field: Field | null | undefined }> = [
    { key: 'colorField', field: config.colorField },
    { key: 'sizeField', field: config.sizeField },
    { key: 'shapeField', field: config.shapeField },
    { key: 'facetBackgroundField', field: config.facetBackgroundField },
  ];

  return singleFields.filter((entry): entry is { key: QueryAffectingSingleFieldKey; field: Field } => !!entry.field);
}

function rawFieldCacheKey(field: Field): string {
  return JSON.stringify({
    columnName: field.columnName,
    type: field.type,
    sourceTable: field.sourceTable,
    castType: field.castType,
    castReplacement: field.castReplacement,
    is_virtual: field.is_virtual,
  });
}

export function createRawQueryFieldsForCache(config: QueryAffectingConfig): Field[] {
  const fields = [
    ...config.xAxisFields,
    ...config.yAxisFields,
    ...getQueryAffectingSingleFields(config).map(entry => entry.field),
    ...(config.labelFields ?? []),
    ...(config.tooltipFields ?? []),
  ];

  const seen = new Set<string>();
  const rawFields: Field[] = [];

  for (const field of fields) {
    const rawField: Field = {
      ...field,
      aggregation: undefined,
      dateTimePart: undefined,
      dateTimeMode: undefined,
    };

    const key = rawFieldCacheKey(rawField);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    rawFields.push(rawField);
  }

  return rawFields;
}