// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { tickStrip } from './tickStrip';
import { ChartGenerationContext } from '../types';

jest.mock('@observablehq/plot', () => ({
  tickX: (data: any[], opts: any) => ({ type: 'tickX', data, opts }),
  tickY: (data: any[], opts: any) => ({ type: 'tickY', data, opts }),
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
}));

describe('tickStrip', () => {
  test('sets band domain for categorical axis', () => {
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
      color: { field: null, scheme: '', bias: 0, reversed: false, manual: '' },
      sizeField: undefined,
    };

    const opts = tickStrip(ctx, 'x', 'value', 'category', {
      dimension: 'Value',
      category: 'Category',
    });

    expect(opts.y?.type).toBe('band');
    expect(opts.y?.tickFormat).toBeUndefined();
  });
  describe('tooltip filterability', () => {
    const categoryField: any = {
      id: 'cat', columnName: 'category', type: 'dimension', flavour: 'discrete',
    };
    const makeCtx = (tooltipFields: any[] = []): ChartGenerationContext => ({
      queryResult: { rows: [{ value: 10, category: 'A' }], columns: [], row_count: 1 } as any,
      xFields: [categoryField],
      yFields: [],
      tooltipFields,
      color: { field: null, scheme: '', bias: 0, reversed: false, manual: '' },
      sizeField: undefined,
    });

    test('category row carries its source field so it gets filter icons', () => {
      const opts: any = tickStrip(makeCtx(), 'y', 'value', 'category', { dimension: 'Value', category: 'Category' });
      const rows = opts.__customTooltip.getFields({ value: 10, category: 'A' });
      const category = rows.find((r: any) => r.label === 'Category');
      expect(category.sourceField).toBe(categoryField);
      expect(category.rawValue).toBe('A');
    });

    test('same field in tooltip dropzone is not listed twice', () => {
      const opts: any = tickStrip(makeCtx([categoryField]), 'y', 'value', 'category', { dimension: 'Value', category: 'Category' });
      const rows = opts.__customTooltip.getFields({ value: 10, category: 'A' });
      expect(rows.filter((r: any) => r.rawValue === 'A')).toHaveLength(1);
      expect(rows.find((r: any) => r.rawValue === 'A').sourceField).toBe(categoryField);
    });
  });
});