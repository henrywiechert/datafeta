import { tickStrip } from './tickStrip';
import { ChartGenerationContext } from '../types';

jest.mock('@observablehq/plot', () => ({
  tickX: (data: any[], opts: any) => ({ type: 'tickX', data, opts }),
  tickY: (data: any[], opts: any) => ({ type: 'tickY', data, opts }),
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
}));

function dim(columnName: string): any {
  return { id: columnName, columnName, type: 'dimension', flavour: 'discrete', dataType: 'string' };
}

describe('tickStrip', () => {
  test('truncates long category labels on the categorical axis', () => {
    const ctx: ChartGenerationContext = {
      queryResult: {
        rows: [
          {
            value: 10,
            category: 'A category label that is clearly too wide for the axis',
          },
        ],
        columns: [],
        row_count: 1,
      } as any,
      xFields: [],
      yFields: [],
      colorField: undefined,
      sizeField: undefined,
      colorScheme: undefined,
    };

    const opts = tickStrip(ctx, 'x', 'value', 'category', {
      dimension: 'Value',
      category: 'Category',
    });

    expect(typeof opts.y?.tickFormat).toBe('function');
    expect((opts.y as any).tickFormat('A category label that is clearly too wide for the axis')).toBe(
      'A category label that is clea...'
    );
  });
});