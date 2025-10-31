// Mock observable plot ESM for Jest (simplified marks sufficient for domain tests)
jest.mock('@observablehq/plot', () => ({
  barX: (data: any[], opts: any) => ({ type: 'barX', data, opts }),
  barY: (data: any[], opts: any) => ({ type: 'barY', data, opts }),
  ruleX: (vals: any, opts: any) => ({ type: 'ruleX', vals, opts }),
  ruleY: (vals: any, opts: any) => ({ type: 'ruleY', vals, opts }),
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
}));

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

  test('single bar with color field shows aggregated total', () => {
    // When there's no category dimension but there IS a color field,
    // the backend returns multiple rows (one per color category).
    // The chart should aggregate these to show the total sum in a single bar.
    // Color information is discarded since we're showing the aggregate total.
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { 'SUM(value)': 10, color: 'red' },
          { 'SUM(value)': 20, color: 'blue' },
          { 'SUM(value)': 30, color: 'green' }
        ],
        columns: [],
        row_count: 3
      } as any,
      xFields: [],
      yFields: [meas('value', 'sum')],
      colorField: dim('color'),
      sizeField: undefined,
      colorScheme: undefined
    };

    const opts = barChart(ctx);
    expect(opts.y?.label).toBe('SUM(value)');
    expect(opts.x?.domain).toEqual([' ']); // single category
    
    // The domain should reflect the total (60 = 10+20+30), not individual values
    const domain = opts.y?.domain as [number, number];
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(60); // total with padding (60 * 1.05 = 63)
  });

  test('negative-only values produce domain [min - pad, 0]', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { 'SUM(value)': -10 },
          { 'SUM(value)': -30 },
          { 'SUM(value)': -20 }
        ],
        columns: [],
        row_count: 3
      } as any,
      xFields: [],
      yFields: [meas('value', 'sum')],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };
    const opts = barChart(ctx);
    const domain = opts.y?.domain as [number, number];
    expect(domain[1]).toBe(0);
    expect(domain[0]).toBeLessThanOrEqual(-30); // padded below min
  });

  test('mixed negative and positive values include both sides with padding', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { 'SUM(value)': -15 },
          { 'SUM(value)': 25 },
          { 'SUM(value)': -5 },
          { 'SUM(value)': 10 }
        ],
        columns: [],
        row_count: 4
      } as any,
      xFields: [],
      yFields: [meas('value', 'sum')],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };
    const opts = barChart(ctx);
    const domain = opts.y?.domain as [number, number];
    expect(domain[0]).toBeLessThan(-15); // padded below min
    expect(domain[1]).toBeGreaterThan(25); // padded above max
    expect(domain[0]).toBeLessThan(0);
    expect(domain[1]).toBeGreaterThan(0);
  });

  test('stacked single bar negative segments produce domain [lower, 0]', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { 'SUM(value)': -10, color: 'red' },
          { 'SUM(value)': -5, color: 'blue' },
          { 'SUM(value)': -20, color: 'green' }
        ],
        columns: [],
        row_count: 3
      } as any,
      xFields: [],
      yFields: [meas('value', 'sum')],
      colorField: dim('color'),
      sizeField: undefined,
      colorScheme: undefined
    };
    const opts = barChart(ctx);
    const domain = opts.y?.domain as [number, number];
    expect(domain[1]).toBe(0);
    expect(domain[0]).toBeLessThan(-35); // padded lower (total -35)
  });
});
