// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { PlotResult } from './types';
import { buildGridFromPlotResult } from './buildGridFromPlotResult';
import { isPlotGridCell } from './gridModel';

function buildPlotResult(overrides: Partial<PlotResult> = {}): PlotResult {
  return {
    library: 'observable-plot',
    plots: [
      {
        id: 'cell-0',
        title: 'Cell 0',
        options: { x: { label: 'X' } as any },
        position: { row: 0, col: 0 },
      },
    ],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr'],
    },
    ...overrides,
  };
}

describe('buildGridFromPlotResult', () => {
  it('maps each plot into a plot cell with metadata and content', () => {
    const result = buildPlotResult({
      plots: [
        {
          id: 'p1',
          title: 'Sales',
          options: { y: { label: 'value' } as any },
          position: { row: 0, col: 0 },
          xField: { id: 'x', columnName: 'cat', dataType: 'string', source: 'column' } as any,
          yField: { id: 'y', columnName: 'val', dataType: 'number', source: 'column' } as any,
          facetBackground: { backgroundColor: '#abc', isMixed: false },
        },
      ],
    });

    const grid = buildGridFromPlotResult(result);

    expect(grid.cells).toHaveLength(1);
    const cell = grid.cells[0];
    expect(cell.id).toBe('p1');
    expect(cell.position).toEqual({ row: 0, col: 0 });
    expect(isPlotGridCell(cell)).toBe(true);
    expect(cell.content.kind).toBe('plot');
    expect((cell.content as any).options).toEqual({ y: { label: 'value' } });
    expect((cell.content as any).facetBackground).toEqual({ backgroundColor: '#abc', isMixed: false });
    expect(cell.metadata?.title).toBe('Sales');
    expect(cell.metadata?.xField?.columnName).toBe('cat');
    expect(cell.metadata?.yField?.columnName).toBe('val');
  });

  it('preserves layout and produces no headers when facetLabels is missing', () => {
    const grid = buildGridFromPlotResult(buildPlotResult());

    expect(grid.layout).toEqual({
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr'],
    });
    expect(grid.headers).toBeUndefined();
  });

  it('builds row and col headers from facetLabels with baseSpan from spans', () => {
    const result = buildPlotResult({
      facetLabels: {
        rowsLevels: [
          { fieldLabel: 'Region', values: ['East', 'West'] },
        ],
        colsLevels: [
          { fieldLabel: 'Year', values: [2024, 2025] },
        ],
        spans: { columns: [], rows: [], baseCols: 2, baseRows: 3 },
      } as any,
    });

    const grid = buildGridFromPlotResult(result);

    expect(grid.headers?.rows?.levels).toEqual([{ fieldLabel: 'Region', values: ['East', 'West'] }]);
    expect(grid.headers?.cols?.levels).toEqual([{ fieldLabel: 'Year', values: [2024, 2025] }]);
    expect(grid.headers?.rows?.baseSpan).toBe(3);
    expect(grid.headers?.cols?.baseSpan).toBe(2);
  });

  it('falls back to groupSpan when spans are not provided', () => {
    const result = buildPlotResult({
      facetLabels: {
        colsLevels: [{ fieldLabel: 'Year', values: [2024] }],
        groupSpan: { columnsPerFacet: 4, rowsPerFacet: 5 },
      } as any,
    });

    const grid = buildGridFromPlotResult(result);

    expect(grid.headers?.cols?.baseSpan).toBe(4);
    expect(grid.headers?.rows).toBeUndefined();
  });

  it('translates a pie passthrough plot into a kind: "pie" cell', () => {
    const pieSpec = {
      slices: [],
      total: 0,
      measureLabel: 'm',
      colorLabel: 'c',
      radiusScale: 1,
    } as any;
    const tooltipConfig = { enabled: true, getFields: () => [] };
    const result = buildPlotResult({
      plots: [
        {
          id: 'pie',
          title: 'Pie',
          options: { __customTooltip: tooltipConfig } as any,
          position: { row: 0, col: 0 },
          renderer: 'pie-svg',
          pieSpec,
        },
      ],
    });

    const grid = buildGridFromPlotResult(result);
    const cell = grid.cells[0];
    expect(cell.content.kind).toBe('pie');
    if (cell.content.kind !== 'pie') throw new Error('expected pie cell');
    expect(cell.content.pieSpec).toBe(pieSpec);
    expect(cell.content.tooltipConfig).toBe(tooltipConfig);
    expect(cell.metadata?.title).toBe('Pie');
  });

  it('still produces a plot cell when renderer is pie-svg but pieSpec is missing', () => {
    const result = buildPlotResult({
      plots: [
        {
          id: 'pie-malformed',
          title: 'Malformed',
          options: {},
          position: { row: 0, col: 0 },
          renderer: 'pie-svg',
        },
      ],
    });

    const grid = buildGridFromPlotResult(result);
    expect(grid.cells[0].content.kind).toBe('plot');
  });

  it('exposes shared measure domains when present', () => {
    const result = buildPlotResult({
      sharedDomains: { byMeasure: { sales: [0, 100] } },
    });
    const grid = buildGridFromPlotResult(result);
    expect(grid.sharedDomains?.byMeasure?.sales).toEqual([0, 100]);
  });

  it('propagates ordered value tuples from facetLabels into header axes', () => {
    const result = buildPlotResult({
      facetLabels: {
        rowsLevels: [{ fieldLabel: 'Region', values: ['East', 'West'] }],
        colsLevels: [{ fieldLabel: 'Year', values: [2024, 2025] }],
        spans: { columns: [], rows: [], baseCols: 1, baseRows: 1 },
        rowsOrderedValueTuples: [['East'], ['West']],
        colsOrderedValueTuples: [[2024], [2025]],
      } as any,
    });

    const grid = buildGridFromPlotResult(result);

    expect(grid.headers?.rows?.orderedValueTuples).toEqual([['East'], ['West']]);
    expect(grid.headers?.cols?.orderedValueTuples).toEqual([[2024], [2025]]);
  });

  it('omits orderedValueTuples when the source array is missing or empty', () => {
    const result = buildPlotResult({
      facetLabels: {
        rowsLevels: [{ fieldLabel: 'Region', values: ['East'] }],
        spans: { columns: [], rows: [], baseCols: 1, baseRows: 1 },
      } as any,
    });
    const grid = buildGridFromPlotResult(result);
    expect(grid.headers?.rows?.orderedValueTuples).toBeUndefined();
  });
});
