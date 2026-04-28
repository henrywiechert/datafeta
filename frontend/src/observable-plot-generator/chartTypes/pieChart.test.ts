import { ChartGenerationContext } from '../types';
import { buildPiePlotSpec, generatePieGrid } from './pieChart';

jest.mock('@observablehq/plot', () => ({
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
}));

function dim(columnName: string, axis?: 'x' | 'y'): any {
  return { id: `${columnName}-${axis || 'field'}`, columnName, type: 'dimension', flavour: 'discrete', dataType: 'string', axis };
}

function meas(columnName: string, aggregation: any = 'sum', axis?: 'x' | 'y'): any {
  return { id: `${columnName}-${axis || 'field'}`, columnName, type: 'measure', flavour: 'continuous', dataType: 'float', aggregation, axis };
}

function context(overrides: Partial<ChartGenerationContext> = {}): ChartGenerationContext {
  const color = dim('segment');
  return {
    xFields: [dim('region', 'x')],
    yFields: [meas('value', 'sum', 'y')],
    colorField: color,
    colorScheme: 'tableau10',
    colorBias: 0,
    manualSize: 40,
    queryResult: {
      columns: [],
      rows: [
        { region: 'North', segment: 'B', 'SUM(value)': 10 },
        { region: 'North', segment: 'A', 'SUM(value)': 30 },
        { region: 'South', segment: 'A', 'SUM(value)': 20 },
      ],
      row_count: 3,
    } as any,
    globalChartType: 'pie',
    ...overrides,
  };
}

describe('pieChart planning', () => {
  test('renders a single-color circle when no discrete color field is present', () => {
    const spec = buildPiePlotSpec({
      rows: context().queryResult.rows,
      context: context({ colorField: undefined }),
      sharedDomains: { measure: {}, numeric: {}, categorical: {}, colorScale: null },
    });

    expect(spec.emptyMessage).toBeUndefined();
    expect(spec.slices).toHaveLength(1);
    expect(spec.slices[0].label).toBe('Total');
    expect(spec.slices[0].value).toBe(60);
  });

  test('aggregates positive values by color and sorts slices stably', () => {
    const ctx = context({
      queryResult: {
        columns: [],
        rows: [
          { segment: 'B', 'SUM(value)': 10 },
          { segment: 'A', 'SUM(value)': 30 },
          { segment: 'A', 'SUM(value)': 0 },
        ],
        row_count: 3,
      } as any,
    });

    const spec = buildPiePlotSpec({
      rows: ctx.queryResult.rows,
      context: ctx,
      sharedDomains: { measure: {}, numeric: {}, categorical: {}, colorScale: null },
    });

    expect(spec.total).toBe(40);
    expect(spec.slices.map((slice) => slice.label)).toEqual(['A', 'B']);
    expect(spec.slices.map((slice) => slice.value)).toEqual([30, 10]);
  });

  test('renders all-negative values by magnitude', () => {
    const ctx = context({
      queryResult: {
        columns: [],
        rows: [
          { segment: 'A', 'SUM(value)': -30.5 },
          { segment: 'B', 'SUM(value)': -5.25 },
        ],
        row_count: 2,
      } as any,
    });

    const spec = buildPiePlotSpec({
      rows: ctx.queryResult.rows,
      context: ctx,
      sharedDomains: { measure: {}, numeric: {}, categorical: {}, colorScale: null },
    });

    expect(spec.emptyMessage).toBeUndefined();
    expect(spec.total).toBeCloseTo(35.75);
    expect(spec.slices.map((slice) => slice.value)).toEqual([30.5, 5.25]);
  });

  test('rejects mixed positive and negative measure values', () => {
    const ctx = context({
      queryResult: {
        columns: [],
        rows: [
          { segment: 'A', 'SUM(value)': 30 },
          { segment: 'B', 'SUM(value)': -5 },
        ],
        row_count: 2,
      } as any,
    });

    const spec = buildPiePlotSpec({
      rows: ctx.queryResult.rows,
      context: ctx,
      sharedDomains: { measure: {}, numeric: {}, categorical: {}, colorScale: null },
    });

    expect(spec.slices).toEqual([]);
    expect(spec.emptyMessage).toContain('cannot mix');
  });

  test('uses X/Y discrete fields as facets, not slices', () => {
    const result = generatePieGrid(context());

    expect(result.layout.rows).toBe(1);
    expect(result.layout.columns).toBe(2);
    expect(result.facetLabels?.colsLevels?.[0].fieldLabel).toBe('region');
    expect(result.plots).toHaveLength(2);
    expect(result.plots[0].renderer).toBe('pie-svg');
    expect(result.plots[0].pieSpec?.slices.map((slice) => slice.label)).toEqual(['A', 'B']);
  });

  test('supports two-dimensional facets from X and Y discrete fields', () => {
    const result = generatePieGrid(context({
      xFields: [dim('region', 'x')],
      yFields: [dim('year', 'y'), meas('value', 'sum', 'y')],
      queryResult: {
        columns: [],
        rows: [
          { region: 'North', year: '2024', segment: 'A', 'SUM(value)': 1 },
          { region: 'South', year: '2024', segment: 'A', 'SUM(value)': 1 },
          { region: 'North', year: '2025', segment: 'A', 'SUM(value)': 1 },
          { region: 'South', year: '2025', segment: 'A', 'SUM(value)': 1 },
        ],
        row_count: 4,
      } as any,
    }));

    expect(result.layout.rows).toBe(2);
    expect(result.layout.columns).toBe(2);
    expect(result.facetLabels?.rowsLevels?.[0].fieldLabel).toBe('year');
    expect(result.facetLabels?.colsLevels?.[0].fieldLabel).toBe('region');
  });

  test('renders Y-axis measures as vertically stacked pies', () => {
    const result = generatePieGrid(context({
      xFields: [],
      yFields: [meas('revenue', 'sum', 'y'), meas('profit', 'sum', 'y')],
      queryResult: {
        columns: [],
        rows: [
          { segment: 'A', 'SUM(revenue)': 100, 'SUM(profit)': 40 },
          { segment: 'B', 'SUM(revenue)': 50, 'SUM(profit)': 10 },
        ],
        row_count: 2,
      } as any,
    }));

    expect(result.layout.rows).toBe(2);
    expect(result.layout.columns).toBe(1);
    expect(result.plots).toHaveLength(2);
    expect(result.plots.map((plot) => plot.position)).toEqual([{ row: 0, col: 0 }, { row: 1, col: 0 }]);
    expect(result.plots.map((plot) => plot.pieSpec?.measureLabel)).toEqual(['revenue', 'profit']);
    expect(result.plots[0].pieSpec?.total).toBe(150);
    expect(result.plots[1].pieSpec?.total).toBe(50);
  });

  test('renders X-axis measures as horizontal pies', () => {
    const result = generatePieGrid(context({
      xFields: [meas('revenue', 'sum', 'x'), meas('profit', 'sum', 'x')],
      yFields: [],
      queryResult: {
        columns: [],
        rows: [
          { segment: 'A', 'SUM(revenue)': 100, 'SUM(profit)': 40 },
          { segment: 'B', 'SUM(revenue)': 50, 'SUM(profit)': 10 },
        ],
        row_count: 2,
      } as any,
    }));

    expect(result.layout.rows).toBe(1);
    expect(result.layout.columns).toBe(2);
    expect(result.plots.map((plot) => plot.position)).toEqual([{ row: 0, col: 0 }, { row: 0, col: 1 }]);
  });
});
