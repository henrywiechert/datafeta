// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { barChart } from './barChart';
import { buildBarOptions } from './barCore';
import { ChartGenerationContext } from '../types';

// Mock observable plot ESM for Jest (simplified marks sufficient for domain tests)
jest.mock('@observablehq/plot', () => ({
  barX: (data: any[], opts: any) => ({ type: 'barX', data, opts }),
  barY: (data: any[], opts: any) => ({ type: 'barY', data, opts }),
  ruleX: (vals: any, opts: any) => ({ type: 'ruleX', vals, opts }),
  ruleY: (vals: any, opts: any) => ({ type: 'ruleY', vals, opts }),
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
}));

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
    expect(opts.y?.label).toBe('value');
    expect(opts.x?.domain).toEqual(['A', 'B', 'C']);
    expect(opts.color).toBeDefined();
    // Width/height are controlled by the grid layout sizing; options may omit explicit width.
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
    expect(opts.y?.label).toBe('value');
    expect(opts.x?.domain).toEqual([' ']);
    // Width/height are controlled by the grid layout sizing; options may omit explicit width.
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
    expect(opts.x?.label).toBe('value');
    expect(opts.y?.domain).toEqual(['A', 'B']);
    // Width/height are controlled by the grid layout sizing; options may omit explicit height.
  });

  test('custom tooltip exposes the category source field for filtering', () => {
    const categoryField = dim('category');
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { category: 'A', 'SUM(value)': 5 },
          { category: 'B', 'SUM(value)': 15 }
        ],
        columns: [],
        row_count: 2
      } as any,
      xFields: [categoryField],
      yFields: [meas('value', 'sum')],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };

    const opts = barChart(ctx);
    const tooltipConfig = (opts as any).__customTooltip;
    const fields = tooltipConfig.getFields(tooltipConfig.data[0]);
    const categoryTooltipField = fields.find((field: any) => field.label === 'category');

    expect(categoryTooltipField).toBeDefined();
    expect(categoryTooltipField.sourceField).toBe(categoryField);
    expect(categoryTooltipField.rawValue).toBe('A');
  });

  test('custom tooltip exposes the color source field with flavour for pinned-tooltip filtering', () => {
    const colorField = dim('segment');
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { category: 'A', 'SUM(value)': 10, segment: 'X' },
          { category: 'A', 'SUM(value)': 5, segment: 'Y' },
        ],
        columns: [],
        row_count: 2
      } as any,
      xFields: [dim('category')],
      yFields: [meas('value', 'sum')],
      colorField,
      sizeField: undefined,
      colorScheme: undefined
    };

    const opts = barChart(ctx);
    const tooltipConfig = (opts as any).__customTooltip;
    const fields = tooltipConfig.getFields(tooltipConfig.data[0]);
    const colorTooltipField = fields.find((f: any) => f.label === 'segment');

    expect(colorTooltipField).toBeDefined();
    // sourceField must be the real Field so the pinned tooltip can show filter icons
    expect(colorTooltipField.sourceField).toBe(colorField);
    expect(colorTooltipField.sourceField.flavour).toBe('discrete');
    expect(colorTooltipField.rawValue).toBe('X');
  });

  test('numeric-string categories are ordered numerically for bins', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { bin: '100', 'SUM(value)': 3 },
          { bin: '2', 'SUM(value)': 1 },
          { bin: '50', 'SUM(value)': 2 }
        ],
        columns: [],
        row_count: 3
      } as any,
      xFields: [dim('bin')],
      yFields: [meas('value', 'sum')],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };

    const opts = barChart(ctx);
    expect(opts.x?.domain).toEqual(['2', '50', '100']);
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
    expect(opts.y?.label).toBe('value');
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

  test('stacked bars with category use stack totals for Y domain, not max single segment', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { region: 'East', segment: 'A', 'SUM(value)': 10 },
          { region: 'East', segment: 'B', 'SUM(value)': 15 },
          { region: 'East', segment: 'C', 'SUM(value)': 8 },
        ],
        columns: [],
        row_count: 3,
      } as any,
      xFields: [dim('region')],
      yFields: [meas('value', 'sum')],
      colorField: dim('segment'),
      sizeField: undefined,
      colorScheme: undefined,
    };

    const opts = barChart(ctx);
    const domain = opts.y?.domain as [number, number];
    // Stack total for East is 33; largest single segment is 15 — domain must reflect the stack.
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(15);
    expect(domain[1]).toBeGreaterThanOrEqual(33);
  });

  test('buildBarOptions with real categoryColumn: color field sourceField has flavour for filtering', () => {
    // Simulates the barFacetGenerator call pattern where categoryColumn is the actual
    // column name (not "__category") and colorField must be explicitly passed through.
    const colorField = dim('segment');
    const categoryField = dim('category');
    const data = [
      { 'SUM(value)': 10, category: 'A', segment: 'X' },
      { 'SUM(value)': 5,  category: 'A', segment: 'Y' },
      { 'SUM(value)': 20, category: 'B', segment: 'X' },
    ];

    const opts = buildBarOptions({
      data,
      measureName: 'SUM(value)',
      orientation: 'vertical',
      categoryColumn: 'category',
      categoryField,
      categoriesDomain: ['A', 'B'],
      colorColumn: 'segment',
      colorField,
      colorScale: null,
    });

    const tooltipConfig = (opts as any).__customTooltip;
    const fields = tooltipConfig.getFields(data[0]);
    const colorTooltipField = fields.find((f: any) => f.label === 'segment');

    expect(colorTooltipField).toBeDefined();
    expect(colorTooltipField.sourceField).toBe(colorField);
    expect(colorTooltipField.sourceField.flavour).toBe('discrete');
    expect(colorTooltipField.rawValue).toBe('X');
  });
});
