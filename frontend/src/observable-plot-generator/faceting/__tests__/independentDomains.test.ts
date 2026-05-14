// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { generatePlot } from '../../observablePlotGenerator';
import { ChartGenerationContext } from '../../types';
import { Field } from '../../../types';
import { createBarCellGenerator } from '../barFacetGenerator';

jest.mock('@observablehq/plot', () => {
  const mark = (type: string) => (data: any, opts: any) => ({ type, data, opts });
  const passthrough = (_opts: any, config: any) => config;
  return {
    areaY: mark('areaY'),
    barX: mark('barX'),
    barY: mark('barY'),
    dot: mark('dot'),
    line: mark('line'),
    lineX: mark('lineX'),
    lineY: mark('lineY'),
    rectX: mark('rectX'),
    rectY: mark('rectY'),
    ruleX: mark('ruleX'),
    ruleY: mark('ruleY'),
    text: mark('text'),
    textX: mark('textX'),
    textY: mark('textY'),
    tickX: mark('tickX'),
    tickY: mark('tickY'),
    stackX: (opts: any) => opts,
    stackY: (opts: any) => opts,
    windowX: passthrough,
    windowY: passthrough,
    linearRegressionX: mark('linearRegressionX'),
    linearRegressionY: mark('linearRegressionY'),
  };
});

type DomainString = string;

const timeField: Field = {
  id: 'ts',
  columnName: 'ts',
  type: 'dimension',
  flavour: 'continuous',
  dataType: 'integer',
};

const facetField: Field = {
  id: 'group',
  columnName: 'group',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const measureField: Field = {
  id: 'value',
  columnName: 'value',
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
  aggregation: 'sum',
};

const rows = [
  { ts: 1, group: 'A', 'SUM(value)': 10 },
  { ts: 2, group: 'A', 'SUM(value)': 12 },
  { ts: 101, group: 'B', 'SUM(value)': 5 },
  { ts: 102, group: 'B', 'SUM(value)': 8 },
];

function buildContext(independentX: boolean): ChartGenerationContext {
  return {
    xFields: [facetField, timeField],
    yFields: [measureField],
    colorBias: 0,
    sizeRange: [4, 20],
    manualSize: 10,
    queryResult: {
      columns: [],
      rows,
      row_count: rows.length,
    },
    independentDomains: independentX ? { x: true } : { x: false },
  };
}

function collectXDomains(result: ReturnType<typeof generatePlot>): Set<DomainString> {
  return new Set(
    (result.cells || [])
      .map((cell) => {
        if (cell.content.kind !== 'plot') return null;
        const domain = (cell.content.options as any)?.x?.domain;
        return domain ? JSON.stringify(domain) : null;
      })
      .filter((d): d is DomainString => Boolean(d))
  );
}

describe('independent X domains per facet', () => {
  it('shares X domains by default and splits them when enabled', () => {
    const sharedResult = generatePlot(buildContext(false));
    expect(sharedResult.cells.length).toBeGreaterThan(1);
    const sharedXDomains = collectXDomains(sharedResult);
    expect(sharedXDomains.size).toBe(1);

    const independentResult = generatePlot(buildContext(true));
    expect(independentResult.cells.length).toBeGreaterThan(1);
    const independentXDomains = collectXDomains(independentResult);
    expect(independentXDomains.size).toBeGreaterThan(1);
  });

  it('keeps faceted bar category tooltip fields filterable', () => {
    const categoryField: Field = {
      id: 'category',
      columnName: 'category',
      type: 'dimension',
      flavour: 'discrete',
      dataType: 'string',
    };

    const barRows = [
      { category: 'A', 'SUM(value)': 10 },
      { category: 'B', 'SUM(value)': 12 },
    ];

    const generator = createBarCellGenerator(
      [categoryField],
      [measureField],
      'barY',
      'x',
      categoryField,
      ['A', 'B'],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    const result = generator(
      barRows,
      {
        ...buildContext(false),
        xFields: [categoryField],
        yFields: [measureField],
        queryResult: { columns: [], rows: barRows, row_count: barRows.length },
      },
      {
        measure: { 'SUM(value)': [0, 12.6] },
        numeric: {},
        categorical: { category: ['A', 'B'] },
        colorScale: null,
      },
      { row: 0, col: 0 },
      {
        rowFacetFields: [facetField],
        colFacetFields: [],
        rowValues: ['A'],
        colValues: [],
      },
    );

    const tooltipConfig = (result.plots[0].options as any).__customTooltip;
    const fields = tooltipConfig.getFields(tooltipConfig.data[0]);
    const categoryTooltipField = fields.find((field: any) => field.label === 'category');

    expect(categoryTooltipField).toBeDefined();
    expect(categoryTooltipField.sourceField).toBe(categoryField);
    expect(categoryTooltipField.rawValue).toBe('A');
  });
});
