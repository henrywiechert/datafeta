import { buildQuery } from '../../queryBuilder/queryBuilder';
import { Field, FilterConfig, QueryDescription } from '../../types';
import { buildRenderPlan, buildViewSpec } from '../buildViewSpec';
import { BuildViewSpecInput } from '../types';

const field = (columnName: string, overrides?: Partial<Field>): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
});

const measure = (columnName: string, overrides?: Partial<Field>): Field => field(columnName, {
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
  ...overrides,
});

const continuousDimension = (columnName: string, overrides?: Partial<Field>): Field => field(columnName, {
  flavour: 'continuous',
  dataType: 'float',
  ...overrides,
});

function buildGolden(input: BuildViewSpecInput): {
  view: ReturnType<typeof summarizeView>;
  render: ReturnType<typeof summarizeRender>;
  query: ReturnType<typeof summarizeQuery>;
} {
  const viewSpec = buildViewSpec(input);
  const renderPlan = buildRenderPlan(viewSpec);
  const queryDescription = buildQuery({
    fields: viewSpec.queryFields,
    selectedTable: 'sales',
    selectedDatabase: 'analytics',
    filterConfigurations: input.filterConfigurations || input.appliedFilterConfigurations,
    labelFields: input.labelFields,
    tooltipFields: input.tooltipFields,
    globalChartType: input.globalChartType || undefined,
    distributionVariant: input.distributionVariant,
    xAxisFields: input.xAxisFields,
    yAxisFields: input.yAxisFields,
    colorField: input.colorField,
  });

  return {
    view: summarizeView(viewSpec),
    render: summarizeRender(renderPlan),
    query: summarizeQuery(queryDescription),
  };
}

function names(fields: Field[] | undefined): string[] {
  return (fields || []).map((field) => field.columnName);
}

function summarizeView(viewSpec: ReturnType<typeof buildViewSpec>) {
  return {
    grain: viewSpec.grain,
    queryMode: viewSpec.queryMode,
    paneRows: names(viewSpec.panePartition.rows),
    paneColumns: names(viewSpec.panePartition.columns),
    inPaneX: names(viewSpec.inPaneAxes.x),
    inPaneY: names(viewSpec.inPaneAxes.y),
    domainPolicy: viewSpec.domainPolicy,
    queryFields: names(viewSpec.queryFields),
    selections: viewSpec.selections.map((selection) => ({
      kind: selection.kind,
      source: selection.source,
      appliesAsFilter: selection.appliesAsFilter,
    })),
    measureGroups: viewSpec.measureGroups.map((group) => ({
      canSharePane: group.compatibility.canSharePane,
      usesSyntheticMeasureValues: group.usesSyntheticMeasureValues,
      members: group.members.map((member) => ({
        field: member.field.columnName,
        aggregation: member.aggregation,
        markType: member.markType,
        manualColor: member.manualColor,
      })),
    })),
  };
}

function summarizeRender(renderPlan: ReturnType<typeof buildRenderPlan>) {
  return {
    paneRows: names(renderPlan.panePartition.rows),
    paneColumns: names(renderPlan.panePartition.columns),
    inPaneX: names(renderPlan.inPaneAxes.x),
    inPaneY: names(renderPlan.inPaneAxes.y),
    facetFields: names(renderPlan.facetFields),
    domainPolicy: renderPlan.domainPolicy,
  };
}

function summarizeQuery(queryDescription: QueryDescription | null) {
  if (!queryDescription) return null;

  return {
    target: [queryDescription.target_database, queryDescription.target_table].filter(Boolean).join('.'),
    queryMode: queryDescription.query_mode || 'standard',
    dimensions: (queryDescription.dimensions || []).map((dimension) => ({
      field: dimension.field,
      flavour: dimension.flavour,
      axis: dimension.axis,
      date_part: dimension.date_part,
      date_mode: dimension.date_mode,
    })),
    measures: (queryDescription.measures || []).map((measure) => ({
      field: measure.field,
      aggregation: measure.aggregation,
      alias: measure.alias,
    })),
    filters: (queryDescription.filters || []).map((filter) => ({
      field: filter.field,
      operator: filter.operator,
      value: filter.value,
    })),
    orderBy: (queryDescription.orderBy || []).map((order) => order.field),
    label_fields: queryDescription.label_fields,
    cdf_fields: queryDescription.cdf_fields,
    cdf_partition_fields: queryDescription.cdf_partition_fields,
    box_plot_fields: queryDescription.box_plot_fields,
    box_plot_color_field: queryDescription.box_plot_color_field,
  };
}

describe('golden ViewSpec / QueryDescription / RenderPlan semantics', () => {
  it('keeps a faceted aggregated bar view aligned across planner, query, and render layers', () => {
    const country = field('country');
    const segment = field('segment');
    const revenue = measure('revenue');
    const label = field('product_name');
    const tooltip = field('order_id');

    expect(buildGolden({
      xAxisFields: [country],
      yAxisFields: [segment, revenue],
      colorField: segment,
      sizeField: null,
      labelFields: [label],
      tooltipFields: [tooltip],
    })).toEqual({
      view: {
        grain: 'grouped',
        queryMode: 'aggregated',
        paneRows: ['segment'],
        paneColumns: ['country'],
        inPaneX: [],
        inPaneY: ['revenue'],
        domainPolicy: { x: 'shared', y: 'shared' },
        queryFields: ['country', 'segment', 'revenue', 'product_name'],
        selections: [],
        measureGroups: [],
      },
      render: {
        paneRows: ['segment'],
        paneColumns: ['country'],
        inPaneX: [],
        inPaneY: ['revenue'],
        facetFields: ['segment', 'country'],
        domainPolicy: { x: 'shared', y: 'shared' },
      },
      query: {
        target: 'analytics.sales',
        queryMode: 'standard',
        dimensions: [
          { field: 'country', flavour: 'discrete', axis: 'x', date_part: undefined, date_mode: undefined },
          { field: 'segment', flavour: 'discrete', axis: 'y', date_part: undefined, date_mode: undefined },
          { field: 'product_name', flavour: 'discrete', axis: undefined, date_part: undefined, date_mode: undefined },
          { field: 'order_id', flavour: 'discrete', axis: undefined, date_part: undefined, date_mode: undefined },
        ],
        measures: [{ field: 'revenue', aggregation: 'sum', alias: 'SUM(revenue)' }],
        filters: [],
        orderBy: ['country', 'segment', 'product_name', 'order_id'],
        label_fields: ['product_name'],
        cdf_fields: undefined,
        cdf_partition_fields: undefined,
        box_plot_fields: undefined,
        box_plot_color_field: undefined,
      },
    });
  });

  it('keeps a CDF view aligned with partition fields from color and implicit facets', () => {
    const revenue = measure('revenue');
    const segment = field('segment');
    const region = field('region');

    expect(buildGolden({
      xAxisFields: [revenue],
      yAxisFields: [segment],
      colorField: region,
      sizeField: null,
      globalChartType: 'cdf',
    })).toEqual(expect.objectContaining({
      view: expect.objectContaining({
        grain: 'cdf',
        queryMode: 'cdf',
        paneRows: ['segment'],
        inPaneX: ['revenue'],
        queryFields: ['revenue', 'segment', 'region'],
      }),
      render: expect.objectContaining({
        paneRows: ['segment'],
        facetFields: ['segment'],
      }),
      query: expect.objectContaining({
        queryMode: 'cdf',
        dimensions: [],
        measures: [],
        cdf_fields: [{ field: 'revenue', alias: 'revenue__cdf' }],
        cdf_partition_fields: ['region', 'segment'],
      }),
    }));
  });

  it('keeps a box-plot summary view aligned with grouped dimensions and color', () => {
    const revenue = continuousDimension('revenue');
    const segment = field('segment');
    const region = field('region');

    expect(buildGolden({
      xAxisFields: [revenue],
      yAxisFields: [segment],
      colorField: region,
      sizeField: null,
      distributionVariant: 'box-plot',
    })).toEqual(expect.objectContaining({
      view: expect.objectContaining({
        grain: 'boxPlotSummary',
        queryMode: 'box_plot',
        paneRows: ['segment'],
        inPaneX: ['revenue'],
      }),
      render: expect.objectContaining({
        facetFields: ['segment'],
      }),
      query: expect.objectContaining({
        queryMode: 'box_plot',
        dimensions: [{ field: 'segment', flavour: 'discrete', axis: undefined, date_part: undefined, date_mode: undefined }],
        measures: [],
        box_plot_fields: [{ field: 'revenue', alias: 'revenue', date_part: undefined, date_mode: undefined }],
        box_plot_color_field: 'region',
      }),
    }));
  });

  it('keeps brush zoom filters as both query filters and separate selection specs', () => {
    const createdAt = field('created_at', {
      flavour: 'continuous',
      dataType: 'datetime',
      dateTimePart: 'month',
      dateTimeMode: 'timeline',
    });
    const revenue = measure('revenue');
    const zoomFilter: FilterConfig = {
      fieldId: createdAt.id,
      columnName: 'created_at',
      type: 'datetime',
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-02-01T00:00:00.000Z',
      isZoomFilter: true,
    };

    expect(buildGolden({
      xAxisFields: [createdAt],
      yAxisFields: [revenue],
      colorField: null,
      sizeField: null,
      appliedFilterConfigurations: { [createdAt.id]: zoomFilter },
    })).toEqual(expect.objectContaining({
      view: expect.objectContaining({
        selections: [{ kind: 'range', source: 'brush', appliesAsFilter: true }],
      }),
      query: expect.objectContaining({
        filters: [
          { field: 'created_at', operator: '>=', value: '2024-01-01T00:00:00.000Z' },
          { field: 'created_at', operator: '<=', value: '2024-02-01T00:00:00.000Z' },
        ],
      }),
    }));
  });

  it('keeps Measure Groups as mark families while documenting the synthetic query boundary', () => {
    const month = field('month');
    const measureNames = field('MeasureNames', {
      isSynthetic: true,
      syntheticType: 'MeasureNames',
    });
    const measureValues = measure('MeasureValues', {
      aggregation: 'sum',
      isSynthetic: true,
      syntheticType: 'MeasureValues',
    });
    const revenue = measure('revenue');
    const cost = measure('cost');

    const viewSpec = buildViewSpec({
      xAxisFields: [month, measureNames],
      yAxisFields: [measureValues],
      colorField: measureNames,
      sizeField: null,
      measureGroupFields: [revenue, cost],
      measureValuesSourceFields: [revenue, cost],
      fieldOverrides: {
        [cost.id]: { chartType: 'line', manualColor: '#123456' },
      },
    });
    const renderPlan = buildRenderPlan(viewSpec);

    expect({
      view: summarizeView(viewSpec),
      render: summarizeRender(renderPlan),
    }).toEqual({
      view: expect.objectContaining({
        grain: 'measureGroupLongForm',
        queryMode: 'aggregated',
        paneColumns: ['month', 'MeasureNames'],
        inPaneY: ['MeasureValues'],
        domainPolicy: { x: 'measureGroupShared', y: 'measureGroupShared' },
        measureGroups: [{
          canSharePane: true,
          usesSyntheticMeasureValues: true,
          members: [
            { field: 'revenue', aggregation: 'sum', markType: undefined, manualColor: undefined },
            { field: 'cost', aggregation: 'sum', markType: 'line', manualColor: '#123456' },
          ],
        }],
      }),
      render: expect.objectContaining({
        paneColumns: ['month', 'MeasureNames'],
        facetFields: ['month', 'MeasureNames'],
        domainPolicy: { x: 'measureGroupShared', y: 'measureGroupShared' },
      }),
    });
  });
});
