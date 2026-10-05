// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { deriveDiscretePaletteScale, getPaletteItemForValue } from './discretePaletteScale';
import { Field } from '../../types';

const field: Field = {
  id: 'kind-id',
  columnName: 'kind',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const rowsOf = (...values: any[]) => values.map((kind) => ({ kind }));

describe('deriveDiscretePaletteScale', () => {
  const options = { palette: ['a', 'b'], otherItem: 'z' };

  it('orders by frequency, then alphabetically, and assigns palette items in order', () => {
    const scale = deriveDiscretePaletteScale(rowsOf('y', 'x', 'x'), field, options);

    expect(scale.domain).toEqual(['x', 'y']);
    expect(scale.valueMap).toEqual({ x: 'a', y: 'b' });
    expect(scale.hasOther).toBe(false);
    expect(scale.legendEntries.map((entry) => entry.item)).toEqual(['a', 'b']);
  });

  it('buckets overflow values and nulls into a single Other entry', () => {
    const scale = deriveDiscretePaletteScale(rowsOf('p', 'p', 'q', 'q', 'r', null), field, options);

    expect(scale.domain).toEqual(['p', 'q']);
    expect(scale.otherValues).toEqual(['r', null]);
    expect(scale.legendEntries[scale.legendEntries.length - 1]).toEqual({ value: 'Other', label: 'Other', item: 'z', isOther: true });
    expect(getPaletteItemForValue('r', scale)).toBe('z');
    expect(getPaletteItemForValue(null, scale)).toBe('z');
    expect(getPaletteItemForValue('p', scale)).toBe('a');
  });

  it('labels an Other bucket that only holds nulls as NULL', () => {
    const scale = deriveDiscretePaletteScale(rowsOf('p', null), field, options);

    expect(scale.legendEntries[scale.legendEntries.length - 1]).toMatchObject({ label: 'NULL', isOther: true });
  });

  it('does not treat a real category named Other as the Other bucket', () => {
    const scale = deriveDiscretePaletteScale(rowsOf('Other', 'Other', 'q'), field, options);

    expect(scale.legendEntries.find((entry) => entry.value === 'Other')).toMatchObject({ isOther: false });
  });
});
