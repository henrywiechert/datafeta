import { Field } from '../../types';
import { buildHeatmapOptions } from './heatmapChart';

jest.mock('@observablehq/plot', () => ({
  cell: (data: any[], opts: any) => ({ type: 'cell', data, opts }),
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

  test('exposes a tooltip title function that includes the measured value', () => {
    const opts = buildHeatmapOptions({
      data: SAMPLE_ROWS,
      xField: dim('region'),
      yField: dim('product'),
      colorField: meas('sales'),
    });

    const cellMark = (opts.marks as any[])[0];
    expect(typeof cellMark.opts.title).toBe('function');
    const title = cellMark.opts.title(SAMPLE_ROWS[0]);
    expect(title).toContain('region');
    expect(title).toContain('North');
    expect(title).toContain('product');
    expect(title).toContain('A');
    expect(title).toContain('100');
  });
});
