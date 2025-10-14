import { multiMeasureBarChart } from './multiMeasureBarChart';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX } from '../../config/chartLayoutConfig';

// Helpers to build mock fields
function dim(columnName: string): any {
  return { id: columnName, columnName, type: 'dimension', flavour: 'discrete', dataType: 'string' };
}
function meas(columnName: string, aggregation: any = 'sum'): any {
  return { id: columnName, columnName, type: 'measure', flavour: 'continuous', dataType: 'float', aggregation };
}

describe('multiMeasureBarChart refactored implementation', () => {
  test('horizontal multi-measure with categories', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { category: 'A', 'SUM(m1)': 10, 'SUM(m2)': 5 },
          { category: 'B', 'SUM(m1)': 20, 'SUM(m2)': 15 },
          { category: 'C', 'SUM(m1)': 30, 'SUM(m2)': 25 }
        ],
        columns: [],
        row_count: 3
      } as any,
      xFields: [meas('m1'), meas('m2')],
      yFields: [dim('category')],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };

  const result = multiMeasureBarChart(ctx) as any;
  expect(result.layout.type).toBe('grid');
  expect(result.plots.length).toBe(2);
    // Horizontal layout -> 1 row, 2 columns
    expect(result.layout.columns).toBe(2);
    expect(result.layout.rows).toBe(1);
    // Shared domains contain both measures
  const m1Domain = (result.sharedDomains as any)['SUM(m1)'];
  const m2Domain = (result.sharedDomains as any)['SUM(m2)'];
    expect(m1Domain[0]).toBe(0);
    expect(m2Domain[0]).toBe(0);
    // Each plot should have height derived from categories (>= categories * BAR_STEP_PX)
  const plotHeights = result.plots.map((p: any) => (p.options as any).height || (p.options as any).size || (p.options as any).height);
    // Because we use buildBarOptions horizontal orientation uses height property
  plotHeights.forEach((h: any) => expect(h).toBe(3 * BAR_STEP_PX));
  });

  test('vertical multi-measure with categories', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          { category: 'A', 'SUM(m1)': 3, 'SUM(m2)': 8 },
          { category: 'B', 'SUM(m1)': 6, 'SUM(m2)': 16 }
        ],
        columns: [],
        row_count: 2
      } as any,
      xFields: [dim('category')],
      yFields: [meas('m1'), meas('m2')],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };

  const result = multiMeasureBarChart(ctx) as any;
  expect(result.layout.type).toBe('grid');
  expect(result.plots.length).toBe(2);
    // Vertical layout -> 2 rows, 1 column
    expect(result.layout.columns).toBe(1);
    expect(result.layout.rows).toBe(2);
  const plotWidths = result.plots.map((p: any) => (p.options as any).width || (p.options as any).size || (p.options as any).width);
  plotWidths.forEach((w: any) => expect(w).toBe(2 * BAR_STEP_PX)); // 2 categories * BAR_STEP_PX
  });

  test('throws when not multi-measure', () => {
    const ctx: ChartGenerationContext = {
      queryResult: { rows: [{ 'SUM(m1)': 5 }], columns: [], row_count: 1 } as any,
      xFields: [meas('m1')],
      yFields: [],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined
    };
    expect(() => multiMeasureBarChart(ctx)).toThrow('Multi-measure chart requires multiple measures');
  });
});
