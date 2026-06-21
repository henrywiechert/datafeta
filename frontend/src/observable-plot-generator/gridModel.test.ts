// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  GridResultModel,
  hasFacetHeaders,
  hasColumnHeaders,
  hasRowHeaders,
  usesOnlyAxislessRenderers,
} from './gridModel';

function gridWith(cells: GridResultModel['cells']): GridResultModel {
  return {
    cells,
    layout: {
      type: 'grid',
      columns: 1,
      rows: cells.length,
      columnSizes: ['fr'],
      rowSizes: cells.map(() => 'fr' as const),
    },
  };
}

describe('usesOnlyAxislessRenderers', () => {
  it('returns false for an empty grid', () => {
    expect(usesOnlyAxislessRenderers(null)).toBe(false);
    expect(usesOnlyAxislessRenderers(gridWith([]))).toBe(false);
  });

  it('returns true when every cell is a pie', () => {
    const grid = gridWith([
      {
        id: 'p',
        position: { row: 0, col: 0 },
        content: {
          kind: 'pie',
          pieSpec: { slices: [], total: 0, measureLabel: '', colorLabel: '', radiusScale: 1 } as any,
        },
      },
    ]);
    expect(usesOnlyAxislessRenderers(grid)).toBe(true);
  });

  it('returns true for plot cells flagged with __hideExternalAxes', () => {
    const grid = gridWith([
      {
        id: 'p',
        position: { row: 0, col: 0 },
        content: { kind: 'plot', options: { __hideExternalAxes: true } as any },
      },
    ]);
    expect(usesOnlyAxislessRenderers(grid)).toBe(true);
  });

  it('returns true for grids of table/empty cells', () => {
    const grid = gridWith([
      {
        id: 't',
        position: { row: 0, col: 0 },
        content: { kind: 'table-cell', symbols: [], rows: [{ source: 'label', label: 'r', value: 'East' }] },
      },
      {
        id: 'm',
        position: { row: 1, col: 0 },
        content: { kind: 'table-cell', symbols: [{ symbol: 'circle', color: 'steelblue', size: 9 }], rows: [] },
      },
      { id: 'e', position: { row: 2, col: 0 }, content: { kind: 'empty' } },
    ]);
    expect(usesOnlyAxislessRenderers(grid)).toBe(true);
  });

  it('returns false when at least one cell is a plot without the hide flag', () => {
    const grid = gridWith([
      {
        id: 'pie',
        position: { row: 0, col: 0 },
        content: {
          kind: 'pie',
          pieSpec: { slices: [], total: 0, measureLabel: '', colorLabel: '', radiusScale: 1 } as any,
        },
      },
      {
        id: 'plot',
        position: { row: 1, col: 0 },
        content: { kind: 'plot', options: {} },
      },
    ]);
    expect(usesOnlyAxislessRenderers(grid)).toBe(false);
  });
});

describe('header presence helpers', () => {
  const gridWithHeaders = (headers: GridResultModel['headers']): GridResultModel => ({
    cells: [],
    layout: { type: 'grid', columns: 1, rows: 1, columnSizes: ['fr'], rowSizes: ['fr'] },
    headers,
  });

  it('hasFacetHeaders is truthy whenever headers is set', () => {
    expect(hasFacetHeaders(null)).toBe(false);
    expect(hasFacetHeaders(gridWithHeaders(undefined))).toBe(false);
    expect(hasFacetHeaders(gridWithHeaders({}))).toBe(true);
  });

  it('hasColumnHeaders / hasRowHeaders check the levels arrays', () => {
    const grid = gridWithHeaders({
      cols: { levels: [{ fieldLabel: 'Year', values: [2024] }], baseSpan: 1 },
    });
    expect(hasColumnHeaders(grid)).toBe(true);
    expect(hasRowHeaders(grid)).toBe(false);
  });
});
