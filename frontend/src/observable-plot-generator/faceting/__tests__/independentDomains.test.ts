import { generatePlot } from '../../observablePlotGenerator';
import { ChartGenerationContext } from '../../types';
import { Field } from '../../../types';

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
    (result.plots || [])
      .map((plot) => {
        const domain = (plot.options as any)?.x?.domain;
        return domain ? JSON.stringify(domain) : null;
      })
      .filter((d): d is DomainString => Boolean(d))
  );
}

describe('independent X domains per facet', () => {
  it('shares X domains by default and splits them when enabled', () => {
    const sharedResult = generatePlot(buildContext(false));
    expect(sharedResult.plots.length).toBeGreaterThan(1);
    const sharedXDomains = collectXDomains(sharedResult);
    expect(sharedXDomains.size).toBe(1);

    const independentResult = generatePlot(buildContext(true));
    expect(independentResult.plots.length).toBeGreaterThan(1);
    const independentXDomains = collectXDomains(independentResult);
    expect(independentXDomains.size).toBeGreaterThan(1);
  });
});
