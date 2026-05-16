// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  createChartAffectingConfig,
  createQueryAffectingConfig,
  createRawQueryFieldsForCache,
  getQueryAffectingSingleFields,
} from './queryAffectingConfig';
import { Field, FilterConfig } from '../types';

const makeField = (columnName: string, overrides?: Partial<Field>): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
});

describe('createQueryAffectingConfig', () => {
  it('normalizes optional fields to stable defaults', () => {
    const config = createQueryAffectingConfig({
      xAxisFields: [],
      yAxisFields: [],
      appliedFilterConfigurations: {},
      colorField: null,
      sizeField: null,
    });

    expect(config.shapeField).toBeNull();
    expect(config.facetBackgroundField).toBeNull();
    expect(config.labelFields).toEqual([]);
    expect(config.tooltipFields).toEqual([]);
    expect(config.measureGroupFields).toEqual([]);
  });
});

describe('createChartAffectingConfig', () => {
  it('preserves chart-affecting settings while normalizing query-affecting fields', () => {
    const chartConfig = createChartAffectingConfig({
      xAxisFields: [],
      yAxisFields: [],
      appliedFilterConfigurations: {},
      colorField: null,
      sizeField: null,
      colorScheme: 'tableau10',
      colorBias: 1,
      manualColor: '#123456',
      sizeRange: [4, 20],
      manualSize: 8,
      labelsEnabled: true,
      labelSamplingStrategy: 'auto',
      labelSamplingThreshold: 300,
      labelSampleEvery: 2,
    });

    expect(chartConfig.colorScheme).toBe('tableau10');
    expect(chartConfig.colorBias).toBe(1);
    expect(chartConfig.manualColor).toBe('#123456');
    expect(chartConfig.sizeRange).toEqual([4, 20]);
    expect(chartConfig.manualSize).toBe(8);
    expect(chartConfig.labelFields).toEqual([]);
    expect(chartConfig.tooltipFields).toEqual([]);
  });
});

describe('getQueryAffectingSingleFields', () => {
  it('returns only configured single-field encodings in a stable order', () => {
    const colorField = makeField('species');
    const shapeField = makeField('category');
    const backgroundField = makeField('segment');

    const result = getQueryAffectingSingleFields(createQueryAffectingConfig({
      xAxisFields: [],
      yAxisFields: [],
      appliedFilterConfigurations: {},
      colorField,
      sizeField: null,
      shapeField,
      facetBackgroundField: backgroundField,
    }));

    expect(result.map(entry => entry.key)).toEqual([
      'colorField',
      'shapeField',
      'facetBackgroundField',
    ]);
    expect(result.map(entry => entry.field.columnName)).toEqual([
      'species',
      'category',
      'segment',
    ]);
  });
});

describe('createRawQueryFieldsForCache', () => {
  it('strips aggregation and datetime extraction from raw cache fields', () => {
    const xField = makeField('created_at', {
      flavour: 'continuous',
      dataType: 'datetime',
      dateTimePart: 'month',
      dateTimeMode: 'timeline',
    });
    const sizeField = makeField('revenue', {
      id: 'revenue-size',
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
      aggregation: 'sum',
    });

    const result = createRawQueryFieldsForCache(createQueryAffectingConfig({
      xAxisFields: [xField],
      yAxisFields: [],
      appliedFilterConfigurations: {},
      colorField: null,
      sizeField,
      labelFields: [],
      tooltipFields: [],
    }));

    expect(result).toHaveLength(2);
    expect(result[0].aggregation).toBeUndefined();
    expect(result[0].dateTimePart).toBeUndefined();
    expect(result[0].dateTimeMode).toBeUndefined();
    expect(result[1].aggregation).toBeUndefined();
  });

  it('deduplicates raw fields by query-relevant identity rather than chip id', () => {
    const xField = makeField('country', { id: 'country-x' });
    const colorField = makeField('country', { id: 'country-color' });
    const tooltipField = makeField('country', { id: 'country-tooltip' });
    const shapeField = makeField('region', { id: 'region-shape' });

    const result = createRawQueryFieldsForCache(createQueryAffectingConfig({
      xAxisFields: [xField],
      yAxisFields: [],
      appliedFilterConfigurations: {},
      colorField,
      sizeField: null,
      shapeField,
      tooltipFields: [tooltipField],
    }));

    expect(result.map(field => field.columnName)).toEqual(['country', 'region']);
  });

  it('includes facet background and measure group config in the normalized query config contract', () => {
    const facetBackgroundField = makeField('segment', { id: 'segment-bg' });
    const measureGroupField = makeField('MeasureValues', {
      id: 'mv-1',
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
    });
    const filters: Record<string, FilterConfig> = {};

    const config = createQueryAffectingConfig({
      xAxisFields: [],
      yAxisFields: [],
      appliedFilterConfigurations: filters,
      colorField: null,
      sizeField: null,
      facetBackgroundField,
      measureGroupFields: [measureGroupField],
    });

    expect(config.facetBackgroundField?.columnName).toBe('segment');
    expect(config.measureGroupFields).toHaveLength(1);
    expect(config.appliedFilterConfigurations).toBe(filters);
  });
});