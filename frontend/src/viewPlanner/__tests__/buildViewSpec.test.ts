// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, FilterConfig } from '../../types';
import { buildRenderPlan, buildViewSpec } from '../buildViewSpec';

const field = (columnName: string, overrides?: Partial<Field>): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
});

describe('buildViewSpec', () => {
  it('captures implicit facets and grouped grain for a bar-style view', () => {
    const country = field('country');
    const segment = field('segment');
    const revenue = field('revenue', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
    });

    const spec = buildViewSpec({
      xAxisFields: [country],
      yAxisFields: [segment, revenue],
      colorField: segment,
      sizeField: null,
    });

    expect({
      columns: spec.panePartition.columns.map((f) => f.columnName),
      rows: spec.panePartition.rows.map((f) => f.columnName),
      inPaneY: spec.inPaneAxes.y.map((f) => f.columnName),
      grain: spec.grain,
      queryMode: spec.queryMode,
      queryMeasures: spec.queryFields
        .filter((f) => f.type === 'measure')
        .map((f) => ({ columnName: f.columnName, aggregation: f.aggregation })),
    }).toEqual({
      columns: ['country'],
      rows: ['segment'],
      inPaneY: ['revenue'],
      grain: 'grouped',
      queryMode: 'aggregated',
      queryMeasures: [{ columnName: 'revenue', aggregation: 'sum' }],
    });
  });

  it('models MeasureValues as a measure-group long-form grain', () => {
    const month = field('month');
    const measureValues = field('MeasureValues', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
      aggregation: 'sum',
      isSynthetic: true,
      syntheticType: 'MeasureValues',
    });
    const revenue = field('revenue', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
    });
    const cost = field('cost', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
    });

    const spec = buildViewSpec({
      xAxisFields: [month],
      yAxisFields: [measureValues],
      colorField: null,
      sizeField: null,
      measureGroupFields: [revenue, cost],
      measureValuesSourceFields: [revenue, cost],
      fieldOverrides: {
        [cost.id]: { chartType: 'line', manualColor: '#123456' },
      },
    });

    expect({
      grain: spec.grain,
      domainPolicy: spec.domainPolicy,
      groupDomainPolicy: spec.measureGroups[0].domainPolicy,
      valueAxis: spec.measureGroups[0].valueAxis,
      comparisonAxis: spec.measureGroups[0].comparisonAxis,
      memberSummary: spec.measureGroups[0].members.map((member) => ({
        columnName: member.field.columnName,
        markType: member.markType,
        manualColor: member.manualColor,
        valueAxis: member.valueAxis,
        domainPolicy: member.domainPolicy,
      })),
      canSharePane: spec.measureGroups[0].compatibility.canSharePane,
    }).toEqual({
      grain: 'measureGroupLongForm',
      domainPolicy: {
        x: 'measureGroupShared',
        y: 'measureGroupShared',
      },
      groupDomainPolicy: {
        comparison: 'shared',
        value: 'measureGroupShared',
      },
      valueAxis: 'y',
      comparisonAxis: 'x',
      memberSummary: [
        { columnName: 'revenue', manualColor: undefined, markType: undefined, valueAxis: 'y', domainPolicy: 'measureGroupShared' },
        { columnName: 'cost', manualColor: '#123456', markType: 'line', valueAxis: 'y', domainPolicy: 'measureGroupShared' },
      ],
      canSharePane: true,
    });
  });

  it('rejects Measure Groups with an independent comparison domain', () => {
    const month = field('month');
    const measureValues = field('MeasureValues', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
      aggregation: 'sum',
      isSynthetic: true,
      syntheticType: 'MeasureValues',
    });
    const revenue = field('revenue', { type: 'measure', flavour: 'continuous', dataType: 'float' });
    const cost = field('cost', { type: 'measure', flavour: 'continuous', dataType: 'float' });

    const spec = buildViewSpec({
      xAxisFields: [month],
      yAxisFields: [measureValues],
      colorField: null,
      sizeField: null,
      measureGroupFields: [revenue, cost],
      measureValuesSourceFields: [revenue, cost],
      independentDomains: { x: true },
    });

    expect(spec.measureGroups[0].compatibility).toEqual(expect.objectContaining({
      canSharePane: false,
      issues: [expect.objectContaining({
        code: 'independent_comparison_domain',
        severity: 'error',
      })],
    }));
  });

  it('rejects unsupported Measure Group mark types', () => {
    const month = field('month');
    const measureValues = field('MeasureValues', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
      aggregation: 'sum',
      isSynthetic: true,
      syntheticType: 'MeasureValues',
    });
    const revenue = field('revenue', { type: 'measure', flavour: 'continuous', dataType: 'float' });
    const target = field('target', { type: 'measure', flavour: 'continuous', dataType: 'float' });

    const spec = buildViewSpec({
      xAxisFields: [month],
      yAxisFields: [measureValues],
      colorField: null,
      sizeField: null,
      measureGroupFields: [revenue, target],
      measureValuesSourceFields: [revenue, target],
      fieldOverrides: {
        [target.id]: { chartType: 'gantt' },
      },
    });

    expect(spec.measureGroups[0].compatibility).toEqual(expect.objectContaining({
      canSharePane: false,
      issues: [expect.objectContaining({
        code: 'unsupported_mark_type',
        severity: 'error',
      })],
    }));
  });

  it('routes density chart type to rawRows grain', () => {
    const spec = buildViewSpec({
      xAxisFields: [field('age', { flavour: 'continuous', dataType: 'float' })],
      yAxisFields: [],
      colorField: null,
      sizeField: null,
      globalChartType: 'density',
    });

    expect(spec.grain).toBe('rawRows');
    expect(spec.queryMode).toBe('raw');
  });

  it('keeps brush zoom selections separate from filters', () => {
    const createdAt = field('created_at', {
      flavour: 'continuous',
      dataType: 'datetime',
    });
    const zoomFilter: FilterConfig = {
      fieldId: createdAt.id,
      columnName: createdAt.columnName,
      type: 'datetime',
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-01-31T00:00:00.000Z',
      isZoomFilter: true,
    };

    const spec = buildViewSpec({
      xAxisFields: [createdAt],
      yAxisFields: [],
      colorField: null,
      sizeField: null,
      appliedFilterConfigurations: {
        [createdAt.id]: zoomFilter,
      },
    });

    expect(spec.selections).toEqual([
      expect.objectContaining({
        id: createdAt.id,
        kind: 'range',
        source: 'brush',
        appliesAsFilter: true,
      }),
    ]);
  });
});

describe('buildViewSpec.deriveGrain (registry dispatch)', () => {
  it('forces cdf grain when cdf is allowed (continuous measure on X)', () => {
    const revenue = field('revenue', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
    });
    const spec = buildViewSpec({
      xAxisFields: [revenue],
      yAxisFields: [],
      colorField: null,
      sizeField: null,
      globalChartType: 'cdf',
    });
    expect(spec.grain).toBe('cdf');
    expect(spec.queryMode).toBe('cdf');
  });

  it('falls back to the default grain when cdf is not allowed for the axis config', () => {
    // Only a discrete dimension on X => cdf.isAllowed returns false.
    const region = field('region');
    const spec = buildViewSpec({
      xAxisFields: [region],
      yAxisFields: [],
      colorField: null,
      sizeField: null,
      globalChartType: 'cdf',
    });
    expect(spec.grain).not.toBe('cdf');
  });

  it('does not override grain for registry entries without a `grain` (pie, heatmap)', () => {
    const country = field('country');
    const revenue = field('revenue', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
    });

    const pieSpec = buildViewSpec({
      xAxisFields: [country],
      yAxisFields: [revenue],
      colorField: null,
      sizeField: null,
      globalChartType: 'pie',
    });
    expect(pieSpec.grain).toBe('grouped');

    const heatmapSpec = buildViewSpec({
      xAxisFields: [country],
      yAxisFields: [revenue],
      colorField: null,
      sizeField: null,
      globalChartType: 'heatmap',
    });
    expect(heatmapSpec.grain).toBe('grouped');
  });

  it('forces rawRows grain for map chart type', () => {
    const longitude = field('longitude', {
      type: 'dimension',
      flavour: 'continuous',
      dataType: 'float',
    });
    const latitude = field('latitude', {
      type: 'dimension',
      flavour: 'continuous',
      dataType: 'float',
    });

    const mapSpec = buildViewSpec({
      xAxisFields: [longitude],
      yAxisFields: [latitude],
      colorField: null,
      sizeField: null,
      globalChartType: 'map',
    });
    expect(mapSpec.grain).toBe('rawRows');
  });
});

describe('buildRenderPlan', () => {
  it('derives facet fields from the canonical pane partition', () => {
    const country = field('country');
    const segment = field('segment');
    const spec = buildViewSpec({
      xAxisFields: [country],
      yAxisFields: [segment],
      colorField: null,
      sizeField: null,
      independentDomains: { y: true },
    });

    const renderPlan = buildRenderPlan(spec);

    expect(renderPlan.facetFields.map((f) => f.columnName)).toEqual(['segment', 'country']);
    expect(renderPlan.domainPolicy).toEqual({ x: 'shared', y: 'independent' });
  });
});
