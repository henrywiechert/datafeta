// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import {
  buildPlotGridSizingStyle,
  computeAutoFacetLeftHeaderWidth,
  computeAutoFacetLeftValueWidths,
  computeAutoFacetTopHeaderHeight,
  computeAutoFacetTopValueHeights,
  computeDynamicXAxisGutterPx,
  computeDynamicYAxisGutterPx,
  computeTotalContentWidth,
  generateColumnTemplate,
  generateRowTemplate,
  getActualRowHeights,
  getEffectiveFacetLabelStyles,
  inferRowSizes,
  resolveFacetLeftValueWidths,
  resolveFacetTopValueHeights,
  sumTrackSizes,
} from './layoutUtils';

function buildGrid(overrides: Partial<GridResultModel> = {}): GridResultModel {
  return {
    cells: [
      {
        id: 'r0',
        position: { row: 0, col: 0 },
        content: { kind: 'plot', options: {} },
        metadata: { title: 'Row 0' },
      },
      {
        id: 'r1',
        position: { row: 1, col: 0 },
        content: { kind: 'plot', options: { height: 160 } as any },
        metadata: { title: 'Row 1' },
      },
      {
        id: 'r2',
        position: { row: 2, col: 0 },
        content: { kind: 'plot', options: {} },
        metadata: { title: 'Row 2' },
      },
    ],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 3,
      columnSizes: ['fr'],
      rowSizes: ['fr', 'fr', 'fr'],
    },
    ...overrides,
  };
}

describe('layoutUtils', () => {
  it('uses one uniform column width when a user override is present', () => {
    expect(generateColumnTemplate('grid', 3, [120, 'fr', 140], 220, 80)).toBe('repeat(3, 220px)');
    expect(computeTotalContentWidth(3, [120, 'fr', 140], 220, 80)).toBe(660);
  });

  it('renders generated column sizes without a user override', () => {
    expect(generateColumnTemplate('grid', 3, [120, 'fr', 140], null, 80)).toBe(
      '120px minmax(80px, 1fr) 140px'
    );
    expect(computeTotalContentWidth(3, [120, 'fr', 140], null, 80)).toBe(340);
  });

  it('uses one flexible column for vertical layouts', () => {
    expect(generateColumnTemplate('vertical', 3, [120, 140, 160], null, 90)).toBe('minmax(90px, 1fr)');
  });

  it('infers row sizes from user overrides, plot heights, layout rows, then fallback height', () => {
    const grid = buildGrid();

    expect(inferRowSizes(grid, 3, [90, 100, 'fr'], 240, 120)).toEqual([240, 240, 240]);
    expect(inferRowSizes(grid, 3, [90, 100, 'fr'], null, 120)).toEqual([90, 160, 120]);
  });

  it('converts row sizes to CSS rows and actual heights', () => {
    const rowSizes: Array<number | 'fr'> = [90, 'fr', 130];

    expect(generateRowTemplate(rowSizes, 120)).toBe('90px 120px 130px');
    expect(getActualRowHeights(rowSizes, 120)).toEqual([90, 120, 130]);
  });

  it('resolves top facet heights per depth before falling back to the shared value', () => {
    expect(resolveFacetTopValueHeights(3, {
      fontSize: 10,
      orientation: 'horizontal',
      heightPx: 26,
      heightPxByDepth: [30, null, 42],
    }, 20)).toEqual([30, 26, 42]);
  });

  it('resolves left facet widths per depth before falling back to the shared value', () => {
    expect(resolveFacetLeftValueWidths(4, {
      fontSize: 10,
      orientation: 'vertical',
      widthPx: 36,
      widthPxByDepth: [null, 50],
    }, 20)).toEqual([36, 50, 36, 36]);
  });

  it('applies horizontal left-value defaults in table mode without changing non-table styles', () => {
    const styles = {
      topHeader: { fontSize: 12, orientation: 'horizontal' as const },
      topValues: { fontSize: 10, orientation: 'horizontal' as const, heightPx: null },
      leftHeader: { fontSize: 12, orientation: 'vertical' as const, widthPx: null },
      leftValues: { fontSize: 10, orientation: 'vertical' as const, widthPx: null, orientationByDepth: [] },
    } as any;

    expect(getEffectiveFacetLabelStyles(styles, 'table-refactor')?.leftValues.orientation).toBe('horizontal');
    expect(getEffectiveFacetLabelStyles(styles, 'bar')?.leftValues.orientation).toBe('vertical');
  });

  it('auto-sizes table facet tracks from content', () => {
    expect(computeAutoFacetLeftHeaderWidth(['Very Long Dimension Name'], {
      fontSize: 12,
      orientation: 'horizontal',
    } as any, 20)).toBeGreaterThan(20);

    expect(computeAutoFacetTopHeaderHeight(['Category'], {
      fontSize: 12,
      orientation: 'horizontal',
    } as any, 18)).toBeGreaterThanOrEqual(18);

    expect(computeAutoFacetLeftValueWidths([
      { values: ['Short', 'A much longer value'] },
    ], {
      fontSize: 10,
      orientation: 'horizontal',
      widthPx: null,
    } as any, 24)[0]).toBeGreaterThan(24);

    expect(computeAutoFacetTopValueHeights([
      { values: ['Alpha', 'Beta'] },
      { values: ['2026-05-07'] },
    ], {
      fontSize: 10,
      orientation: 'horizontal',
      heightPx: null,
    } as any, 18)).toEqual([26, 26]);
  });

  it('sums resolved facet track sizes for reserved-space calculations', () => {
    expect(sumTrackSizes([24, 36, 40])).toBe(100);
  });

  it('builds one shared sizing style for visible and hidden plot grids', () => {
    expect(buildPlotGridSizingStyle({
      plotTemplateColumns: '100px 120px',
      plotRowsSpec: '80px 90px',
      totalContentWidthPx: 220,
      columnSizes: [100, 120],
    })).toEqual({
      display: 'grid',
      gridTemplateColumns: '100px 120px',
      gridTemplateRows: '80px 90px',
      minWidth: '220px',
      width: '220px',
    });

    expect(buildPlotGridSizingStyle({
      plotTemplateColumns: 'minmax(120px, 1fr)',
      plotRowsSpec: '80px',
      totalContentWidthPx: 120,
      columnSizes: ['fr'],
    }).width).toBe('100%');
  });

  it('sizes the X-axis gutter from formatted categorical ticks', () => {
    const grid = buildGrid({
      cells: [
        {
          id: 'c0',
          position: { row: 0, col: 0 },
          content: {
            kind: 'plot',
            options: {
              x: {
                type: 'band',
                domain: ['Extremely verbose category label that should not drive layout'],
                tickFormat: () => 'Short label',
              },
            },
          },
        } as any,
      ],
      layout: {
        type: 'grid',
        columns: 1,
        rows: 1,
        columnSizes: ['fr'],
        rowSizes: ['fr'],
      },
    });

    expect(computeDynamicXAxisGutterPx(grid, 1, null)).toBe(79);
  });

  it('caps the X-axis gutter for long categorical ticks to the rendered band height', () => {
    const grid = buildGrid({
      cells: [
        {
          id: 'c0',
          position: { row: 0, col: 0 },
          content: {
            kind: 'plot',
            options: {
              x: {
                type: 'band',
                domain: ['Extremely verbose category label that should not reserve its full raw height'],
              },
            },
          },
        } as any,
      ],
      layout: {
        type: 'grid',
        columns: 1,
        rows: 1,
        columnSizes: ['fr'],
        rowSizes: ['fr'],
      },
    });

    expect(computeDynamicXAxisGutterPx(grid, 1, null)).toBe(79);
  });

  it('sizes the Y-axis gutter from formatted categorical ticks', () => {
    const grid = buildGrid({
      cells: [
        {
          id: 'r0',
          position: { row: 0, col: 0 },
          content: {
            kind: 'plot',
            options: {
              y: {
                type: 'band',
                domain: ['Extremely verbose category label that should not drive layout'],
                tickFormat: () => 'Short label',
              },
            },
          },
        } as any,
      ],
      layout: {
        type: 'grid',
        columns: 1,
        rows: 1,
        columnSizes: ['fr'],
        rowSizes: ['fr'],
      },
    });

    expect(computeDynamicYAxisGutterPx(grid, 1, null)).toBe(76);
  });

  it('caps the Y-axis gutter for long categorical ticks to the rendered band width', () => {
    const grid = buildGrid({
      cells: [
        {
          id: 'r0',
          position: { row: 0, col: 0 },
          content: {
            kind: 'plot',
            options: {
              y: {
                type: 'band',
                domain: ['Extremely verbose category label that should not reserve its full raw width'],
              },
            },
          },
        } as any,
      ],
      layout: {
        type: 'grid',
        columns: 1,
        rows: 1,
        columnSizes: ['fr'],
        rowSizes: ['fr'],
      },
    });

    expect(computeDynamicYAxisGutterPx(grid, 1, null)).toBe(130);
  });
});
