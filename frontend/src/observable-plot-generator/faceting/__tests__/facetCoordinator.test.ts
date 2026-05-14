// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../../types';
import { SharedDomains } from '../facetDomains';
import { CellGenerator, coordinateFacetedGrid } from '../facetCoordinator';
import { FacetPlan } from '../facetPlanner';
import { ChartGenerationContext } from '../../types';

jest.mock('@observablehq/plot', () => ({
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
  line: (data: any[], opts: any) => ({ type: 'line', data, opts }),
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
}));

const rowFacetField: Field = {
  id: 'region',
  columnName: 'region',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const colFacetField: Field = {
  id: 'segment',
  columnName: 'segment',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const categoryField: Field = {
  id: 'category',
  columnName: 'category',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const xField: Field = {
  id: 'ts',
  columnName: 'ts',
  type: 'dimension',
  flavour: 'continuous',
  dataType: 'integer',
};

const yMeasure: Field = {
  id: 'value',
  columnName: 'value',
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
  aggregation: 'sum',
};

const colorField: Field = {
  id: 'color',
  columnName: 'color',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const backgroundField: Field = {
  id: 'background',
  columnName: 'background',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const rows = [
  { region: 'North', segment: 'Consumer', category: 'A', ts: 1, 'SUM(value)': 10, color: 'red', background: 'cold' },
  { region: 'North', segment: 'Business', category: 'B', ts: 2, 'SUM(value)': 12, color: 'blue', background: 'cold' },
  { region: 'South', segment: 'Consumer', category: 'A', ts: 101, 'SUM(value)': 110, color: 'red', background: 'hot' },
  { region: 'South', segment: 'Business', category: 'C', ts: 102, 'SUM(value)': 120, color: 'blue', background: 'cold' },
];

function buildContext(overrides: Partial<ChartGenerationContext> = {}): ChartGenerationContext {
  return {
    xFields: [xField],
    yFields: [yMeasure],
    colorField,
    colorBias: 0,
    queryResult: {
      columns: [],
      rows,
      row_count: rows.length,
    },
    ...overrides,
  };
}

function buildPlan(
  rowFacetFields: Field[] = [rowFacetField],
  colFacetFields: Field[] = [colFacetField]
): FacetPlan {
  return { rowFacetFields, colFacetFields };
}

function createRecordingCellGenerator(): CellGenerator {
  return (cellData, _context, sharedDomains, facetPosition) => ({
    columns: 1,
    rows: 1,
    plots: [{
      id: 'cell',
      title: 'Cell',
      position: { row: 0, col: 0 },
      options: {
        cellRows: cellData.length,
        facetPosition,
        xDomain: sharedDomains.numeric.ts,
        yDomain: sharedDomains.measure['SUM(value)'],
        colorDomain: sharedDomains.colorScale?.domain,
        categoryDomain: sharedDomains.categorical.category,
      } as any,
    }],
  });
}

describe('coordinateFacetedGrid', () => {
  it('handles empty facet directions with one implicit row or column', () => {
    const result = coordinateFacetedGrid({
      context: buildContext(),
      plan: buildPlan([], [colFacetField]),
      cellGenerator: createRecordingCellGenerator(),
    });

    expect(result.layout.rows).toBe(1);
    expect(result.layout.columns).toBe(2);
    expect(result.plots.map((plot) => plot.position)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
  });

  it('offsets nested cell plots across row and column facets', () => {
    const cellGenerator: CellGenerator = () => ({
      columns: 2,
      rows: 1,
      columnSizes: [120, 140],
      rowSizes: [80],
      minColumnSizes: [60, 70],
      minRowSizes: [50],
      plots: [
        { id: 'left', title: 'Left', position: { row: 0, col: 0 }, options: {} },
        { id: 'right', title: 'Right', position: { row: 0, col: 1 }, options: {} },
      ],
    });

    const result = coordinateFacetedGrid({
      context: buildContext(),
      plan: buildPlan(),
      cellGenerator,
    });

    expect(result.layout.columns).toBe(4);
    expect(result.layout.rows).toBe(2);
    expect(result.layout.columnSizes).toEqual([120, 140, 120, 140]);
    expect(result.layout.rowSizes).toEqual([80, 80]);
    expect(result.layout.minColumnSizes).toEqual([60, 70, 60, 70]);
    expect(result.layout.minRowSizes).toEqual([50, 50]);
    expect(result.plots.map((plot) => plot.position)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
  });

  it('keeps independent X domains by column and independent Y domains by row', () => {
    const result = coordinateFacetedGrid({
      context: buildContext({ independentDomains: { x: true, y: true } }),
      plan: buildPlan(),
      cellGenerator: createRecordingCellGenerator(),
    });

    const xDomainsByColumn = new Map<number, string>();
    const yDomainsByRow = new Map<number, string>();
    for (const plot of result.plots) {
      xDomainsByColumn.set(plot.position.col, JSON.stringify((plot.options as any).xDomain));
      yDomainsByRow.set(plot.position.row, JSON.stringify((plot.options as any).yDomain));
    }

    expect(new Set(xDomainsByColumn.values()).size).toBe(2);
    expect(new Set(yDomainsByRow.values()).size).toBe(2);
  });

  it('preserves global color scales and explicit category domains in every cell', () => {
    const sharedCategoryDomain = ['A', 'B', 'C'];
    const seenDomains: SharedDomains[] = [];
    const cellGenerator: CellGenerator = (cellData, context, sharedDomains, facetPosition, facetCellContext) => {
      seenDomains.push(sharedDomains);
      return createRecordingCellGenerator()(cellData, context, sharedDomains, facetPosition, facetCellContext);
    };

    const result = coordinateFacetedGrid({
      context: buildContext({ independentDomains: { x: true } }),
      plan: buildPlan(),
      cellGenerator,
      categoryField,
      sharedCategoryDomain,
    });

    expect(result.plots).toHaveLength(4);
    expect(new Set(result.plots.map((plot) => JSON.stringify((plot.options as any).colorDomain))).size).toBe(1);
    expect(result.plots.every((plot) =>
      JSON.stringify((plot.options as any).categoryDomain) === JSON.stringify(sharedCategoryDomain)
    )).toBe(true);
    expect(seenDomains.every((domain) => domain.colorScale === seenDomains[0].colorScale)).toBe(true);
  });

  it('propagates facet background information per generated plot', () => {
    const result = coordinateFacetedGrid({
      context: buildContext({
        facetBackgroundField: backgroundField,
        facetBackgroundScheme: 'tableau10',
        facetBackgroundOpacity: 0.2,
      }),
      plan: buildPlan([rowFacetField], []),
      cellGenerator: createRecordingCellGenerator(),
    });

    expect(result.plots).toHaveLength(2);
    expect(result.plots[0].facetBackground?.isMixed).toBe(false);
    expect(result.plots[0].facetBackground?.backgroundColor).toMatch(/^rgba\(/);
    expect(result.plots[1].facetBackground?.isMixed).toBe(true);
    expect(result.plots[1].facetBackground?.backgroundColor).toBeNull();
  });
});
