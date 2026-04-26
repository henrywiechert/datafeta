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
      memberSummary: spec.measureGroups[0].members.map((member) => ({
        columnName: member.field.columnName,
        markType: member.markType,
        manualColor: member.manualColor,
      })),
      canSharePane: spec.measureGroups[0].compatibility.canSharePane,
    }).toEqual({
      grain: 'measureGroupLongForm',
      domainPolicy: {
        x: 'measureGroupShared',
        y: 'measureGroupShared',
      },
      memberSummary: [
        { columnName: 'revenue', manualColor: undefined, markType: undefined },
        { columnName: 'cost', manualColor: '#123456', markType: 'line' },
      ],
      canSharePane: true,
    });
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
