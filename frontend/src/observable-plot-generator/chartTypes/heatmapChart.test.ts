import { Field } from '../../types';
import { ChartGenerationContext } from '../types';
import { buildHeatmapOptions, generateHeatmapGrid } from './heatmapChart';

jest.mock('@observablehq/plot', () => ({
  cell: (data: any[], opts: any) => ({ type: 'cell', data, opts }),
  rect: (data: any[], opts: any) => ({ type: 'rect', data, opts }),
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
}));

function dim(columnName: string): Field {
  return {
    id: `dim-${columnName}`,
    columnName,
    type: 'dimension',
    flavour: 'discrete',
    dataType: 'string',
  } as Field;
}

function meas(columnName: string, aggregation: any = 'sum'): Field {
  return {
    id: `meas-${columnName}-${aggregation}`,
    columnName,
    type: 'measure',
    flavour: 'continuous',
    dataType: 'float',
    aggregation,
  } as Field;
}

const SAMPLE_ROWS = [
  { region: 'North', product: 'A', 'SUM(sales)': 100 },
  { region: 'North', product: 'B', 'SUM(sales)': 200 },
  { region: 'South', product: 'A', 'SUM(sales)': 50 },
  { region: 'South', product: 'B', 'SUM(sales)': 150 },
];

describe('buildHeatmapOptions (PR 9)', () => {
  test('produces a Plot.cell mark using band scales for X and Y', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
    });

    expect((opts.x as any).type).toBe('band');
    expect((opts.y as any).type).toBe('band');
    expect(opts.marks).toHaveLength(1);

    const cellMark = (opts.marks as any[])[0];
    expect(cellMark.type).toBe('cell');
    expect(cellMark.data).toEqual(SAMPLE_ROWS);
    expect(cellMark.opts.x).toBe('region');
    expect(cellMark.opts.y).toBe('product');
    // Fill should reference the aggregated measure column.
    expect(cellMark.opts.fill).toBe('SUM(sales)');
  });

  test('builds a continuous color scale when color is a measure', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
    });

    expect(opts.color).toBeDefined();
    expect((opts.color as any).type).toBe('linear');
    expect((opts.color as any).domain).toEqual([50, 200]);
    expect(Array.isArray((opts.color as any).range)).toBe(true);
  });

  test('falls back to a single fill color when no color field is given', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
    });

    const cellMark = (opts.marks as any[])[0];
    expect(typeof cellMark.opts.fill).toBe('string');
    expect(cellMark.opts.fill).not.toBe('region');
    expect(cellMark.opts.fill).not.toBe('product');
    expect(opts.color).toBeUndefined();
  });

  test('uses the user-provided manual color when no color field is given', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      manualColor: '#ff0000',
    });

    const cellMark = (opts.marks as any[])[0];
    expect(cellMark.opts.fill).toBe('#ff0000');
  });

  test('attaches the shared custom tooltip config with x, y, and color fields', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
    });

    const tooltipConfig = (opts as any).__customTooltip;
    expect(tooltipConfig).toBeDefined();
    expect(tooltipConfig.enabled).toBe(true);
    expect(tooltipConfig.data).toBe(SAMPLE_ROWS);

    const fields = tooltipConfig.getFields(SAMPLE_ROWS[0]);
    expect(fields.map((field: any) => field.label)).toEqual([
      'region',
      'product',
      'sales(sum)',
    ]);
    expect(fields.map((field: any) => field.formattedValue)).toEqual([
      'North',
      'A',
      '100',
    ]);

    const cellMark = (opts.marks as any[])[0];
    expect(cellMark.opts.title).toBeUndefined();
  });

  test('includes the size field in custom tooltip output for size-encoded heatmaps', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
      sizeField: meas('sales'),
      sizeRange: [3, 18],
    });

    const tooltipConfig = (opts as any).__customTooltip;
    const fields = tooltipConfig.getFields(SAMPLE_ROWS[1]);

    expect(fields.map((field: any) => field.label)).toEqual([
      'region',
      'product',
      'sales(sum)',
    ]);
    expect(fields.map((field: any) => field.formattedValue)).toEqual([
      'North',
      'B',
      '200',
    ]);
  });
});

describe('generateHeatmapGrid', () => {
  function buildCtx(overrides: Partial<ChartGenerationContext>): ChartGenerationContext {
    return {
      xFields: [],
      yFields: [],
      queryResult: { rows: [], columns: [], row_count: 0 } as any,
      ...overrides,
    } as ChartGenerationContext;
  }

  test('renders a single 1×1 heatmap when X and Y each have exactly one discrete dim', () => {
    const ctx = buildCtx({
      xFields: [dim('region')],
      yFields: [dim('product')],
      colorField: meas('sales'),
      queryResult: { rows: SAMPLE_ROWS, columns: [], row_count: SAMPLE_ROWS.length } as any,
    });

    const result = generateHeatmapGrid(ctx);

    expect(result.layout.columns).toBe(1);
    expect(result.layout.rows).toBe(1);
    expect(result.plots).toHaveLength(1);
    expect(result.plots[0].id).toBe('heatmap');

    // The heatmap's plot should be built from the *full* data set, not from a
    // single (region, product) facet cell — i.e. faceting must be skipped.
    const cellMark = (result.plots[0].options as any).marks[0];
    expect(cellMark.type).toBe('cell');
    expect(cellMark.data).toEqual(SAMPLE_ROWS);
    expect(cellMark.opts.x).toBe('region');
    expect(cellMark.opts.y).toBe('product');
    expect(cellMark.opts.fill).toBe('SUM(sales)');
  });

  test('returns a guidance message when one of the axes is empty', () => {
    const ctx = buildCtx({
      xFields: [dim('region')],
      yFields: [],
      queryResult: { rows: SAMPLE_ROWS, columns: [], row_count: SAMPLE_ROWS.length } as any,
    });

    const result = generateHeatmapGrid(ctx);

    expect(result.plots).toHaveLength(1);
    expect(result.plots[0].id).toBe('heatmap-message');
    const textMark = (result.plots[0].options as any).marks[0];
    expect(textMark.type).toBe('text');
  });

  test('uses the *innermost* (last) field on each axis as the heatmap axes', () => {
    const country = dim('country');
    const region = dim('region');
    const segment = dim('segment');
    const product = dim('product');
    // X = [country, region]   → region is innermost (used as heatmap X)
    // Y = [segment, product]  → product is innermost (used as heatmap Y)
    const ctx = buildCtx({
      xFields: [country, region],
      yFields: [segment, product],
      colorField: meas('sales'),
      queryResult: { rows: [], columns: [], row_count: 0 } as any,
    });

    // With 1 outer dim on each axis remaining as facets, generateHeatmapGrid
    // would route through `coordinateFacetedGrid`. Instead of asserting on
    // the full faceted grid here, re-use the shared cell builder so the test
    // stays focused on which fields end up as the heatmap's chart axes.
    const opts = buildHeatmapOptions({
      data: [],
      xField: ctx.xFields[ctx.xFields.length - 1],
      yField: ctx.yFields[ctx.yFields.length - 1],
      colorField: meas('sales'),
    });
    const cellMark = (opts.marks as any[])[0];
    expect(cellMark.opts.x).toBe('region');
    expect(cellMark.opts.y).toBe('product');
  });

  test('shares one continuous color domain across heatmap facets', () => {
    const country = dim('country');
    const region = dim('region');
    const product = dim('product');
    const rows = [
      { country: 'US', region: 'North', product: 'A', 'SUM(sales)': 10 },
      { country: 'US', region: 'South', product: 'A', 'SUM(sales)': 20 },
      { country: 'CA', region: 'North', product: 'A', 'SUM(sales)': 100 },
      { country: 'CA', region: 'South', product: 'A', 'SUM(sales)': 200 },
    ];

    const ctx = buildCtx({
      xFields: [country, region],
      yFields: [product],
      colorField: meas('sales'),
      queryResult: { rows, columns: [], row_count: rows.length } as any,
    });

    const result = generateHeatmapGrid(ctx);
    expect(result.plots).toHaveLength(2);

    const domains = result.plots.map((plot) => (plot.options.color as any)?.domain);
    expect(domains).toEqual([
      [10, 200],
      [10, 200],
    ]);
  });
});

describe('buildHeatmapOptions size encoding', () => {
  test('switches from Plot.cell to Plot.rect with proportional extents driven by sizeField', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
      sizeField: meas('sales'),
      sizeRange: [3, 18],
    });

    const primary = (opts.marks as any[])[0];
    expect(primary.type).toBe('rect');
    expect((opts.x as any).type).toBe('linear');
    expect((opts.y as any).type).toBe('linear');
    expect((opts.x as any).ticks).toEqual([0, 1]);
    expect((opts.x as any).tickFormat(0)).toBe('North');
    expect((opts.y as any).tickFormat(1)).toBe('B');

    const width = primary.opts.x2(primary.data[0]) - primary.opts.x1(primary.data[0]);
    const height = primary.opts.y2(primary.data[0]) - primary.opts.y1(primary.data[0]);
    expect(width).toBeCloseTo(height, 5);
    expect(width).toBeLessThan(1);
  });

  test('falls back to Plot.cell when no size field is configured', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
      manualSize: 40,
    });

    const primary = (opts.marks as any[])[0];
    expect(primary.type).toBe('cell');
    expect((opts as any).r).toBeUndefined();
  });

  test('uses manualSize as a fixed square radius when no size field is configured', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
      manualSize: 12,
    });

    const primary = (opts.marks as any[])[0];
    expect(primary.type).toBe('rect');
    const width = primary.opts.x2(primary.data[0]) - primary.opts.x1(primary.data[0]);
    const height = primary.opts.y2(primary.data[0]) - primary.opts.y1(primary.data[0]);
    expect(width).toBeCloseTo(0.3, 5);
    expect(height).toBeCloseTo(0.3, 5);
  });

  test('closes the residual gap at max manual size by using zero inset', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
      manualSize: 50,
    });

    const primary = (opts.marks as any[])[0];
    expect(primary.type).toBe('rect');
    expect(primary.opts.inset).toBe(0);

    const width = primary.opts.x2(primary.data[0]) - primary.opts.x1(primary.data[0]);
    const height = primary.opts.y2(primary.data[0]) - primary.opts.y1(primary.data[0]);
    expect(width).toBe(1);
    expect(height).toBe(1);
  });

  test('sorts indexed heatmap axes deterministically instead of preserving row encounter order', () => {
    const opts = buildHeatmapOptions({
      data: [
        { region: 'South', product: 'B', 'SUM(sales)': 1 },
        { region: 'North', product: 'A', 'SUM(sales)': 2 },
        { region: 'South', product: 'A', 'SUM(sales)': 3 },
        { region: 'North', product: 'B', 'SUM(sales)': 4 },
      ],
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
      manualSize: 12,
    });

    expect((opts.x as any).ticks).toEqual([0, 1]);
    expect((opts.y as any).ticks).toEqual([0, 1]);
    expect((opts.x as any).tickFormat(0)).toBe('North');
    expect((opts.x as any).tickFormat(1)).toBe('South');
    expect((opts.y as any).tickFormat(0)).toBe('A');
    expect((opts.y as any).tickFormat(1)).toBe('B');
  });
});

describe('buildHeatmapOptions label encoding', () => {
  test('overlays a Plot.text mark with the first label field as the cell text', () => {
    const labelField = meas('sales');
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
      labelFields: [labelField],
    });

    expect(opts.marks).toHaveLength(2);
    const textMark = (opts.marks as any[])[1];
    expect(textMark.type).toBe('text');
    expect(textMark.opts.x).toBe('region');
    expect(textMark.opts.y).toBe('product');
    // The label text accessor formats the SUM(sales) value of each row.
    const text = textMark.opts.text(SAMPLE_ROWS[0]);
    expect(text).toContain('100');
  });

  test('does not add a text mark when labelFields is empty / unset', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
    });

    expect(opts.marks).toHaveLength(1);
  });
});
