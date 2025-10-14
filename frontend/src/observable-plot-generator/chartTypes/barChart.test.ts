import { barChart } from './barChart';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX } from '../../config/chartLayoutConfig';

// Minimal mock Field objects
function dim(columnName: string): any {
  return { id: columnName, columnName, type: 'dimension', flavour: 'discrete', dataType: 'string' };
}
function meas(columnName: string, aggregation: any = 'sum'): any {
  return { id: columnName, columnName, type: 'measure', flavour: 'continuous', dataType: 'float', aggregation };
}

describe('barChart refactored implementation', () => {
  test('vertical with dimension and color + size', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { category: 'A', 'SUM(value)': 10, color: 'c1', 'SUM(size)': 5 },
          { category: 'B', 'SUM(value)': 20, color: 'c2', 'SUM(size)': 6 },
          { category: 'C', 'SUM(value)': 30, color: 'c1', 'SUM(size)': 7 },
        ],
        columns: [],
        row_count: 3
      } as any,
      xFields: [dim('category')],
      yFields: [meas('value', 'sum')],
      colorField: dim('color'),
      sizeField: meas('size', 'sum'),
      colorScheme: undefined
    };

    const opts = barChart(ctx);
    expect(opts.y?.label).toBe('SUM(value)');
    expect(opts.x?.domain).toEqual(['A', 'B', 'C']);
    expect(opts.color).toBeDefined();
  expect((opts as any).width).toBe(3 * BAR_STEP_PX);
  });

  test('single vertical bar (no dimension)', () => {
    const ctx: ChartGenerationContext = {
      queryResult: { rows: [{ 'SUM(value)': 42 }], columns: [], row_count: 1 } as any,
      xFields: [],
      yFields: [meas('value', 'sum')],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };

    const opts = barChart(ctx);
    expect(opts.y?.label).toBe('SUM(value)');
    expect(opts.x?.domain).toEqual([' ']);
  expect((opts as any).width).toBe(5 * BAR_STEP_PX);
  });

  test('horizontal with dimension', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { category: 'A', 'SUM(value)': 5 },
          { category: 'B', 'SUM(value)': 15 }
        ],
        columns: [],
        row_count: 2
      } as any,
      xFields: [meas('value', 'sum')],
      yFields: [dim('category')],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };

    const opts = barChart(ctx);
    expect(opts.x?.label).toBe('SUM(value)');
    expect(opts.y?.domain).toEqual(['A', 'B']);
  expect((opts as any).height).toBe(2 * BAR_STEP_PX); // unchanged for multi-category
  });

  test('domain starts at zero and pads positive max', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { 'SUM(value)': 0 },
          { 'SUM(value)': 100 }
        ],
        columns: [],
        row_count: 2
      } as any,
      xFields: [],
      yFields: [meas('value', 'sum')],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };
    const opts = barChart(ctx);
    const domain = opts.y?.domain as [number, number];
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(100); // padded upper
  });
});
