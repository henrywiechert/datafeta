import { PlotResult } from '../../../../observable-plot-generator/types';
import {
  buildPlotGridSizingStyle,
  computeTotalContentWidth,
  generateColumnTemplate,
  generateRowTemplate,
  getActualRowHeights,
  inferRowSizes,
} from './layoutUtils';

function buildSpec(overrides: Partial<PlotResult> = {}): PlotResult {
  return {
    library: 'observable-plot',
    plots: [
      { id: 'r0', title: 'Row 0', options: {}, position: { row: 0, col: 0 } },
      { id: 'r1', title: 'Row 1', options: { height: 160 } as any, position: { row: 1, col: 0 } },
      { id: 'r2', title: 'Row 2', options: {}, position: { row: 2, col: 0 } },
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
    const spec = buildSpec();

    expect(inferRowSizes(spec, 3, [90, 100, 'fr'], 240, 120)).toEqual([240, 240, 240]);
    expect(inferRowSizes(spec, 3, [90, 100, 'fr'], null, 120)).toEqual([90, 160, 120]);
  });

  it('converts row sizes to CSS rows and actual heights', () => {
    const rowSizes: Array<number | 'fr'> = [90, 'fr', 130];

    expect(generateRowTemplate(rowSizes, 120)).toBe('90px 120px 130px');
    expect(getActualRowHeights(rowSizes, 120)).toEqual([90, 120, 130]);
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
});
