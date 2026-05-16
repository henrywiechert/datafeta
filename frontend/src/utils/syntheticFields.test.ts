// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  generateSyntheticFieldsForGroup,
  getMeasureFieldsForUnpivot,
} from './syntheticFields';
import { Field } from '../types';

const buildField = (overrides: Partial<Field>): Field => ({
  id: overrides.id || 'field-id',
  columnName: overrides.columnName || 'col',
  type: overrides.type || 'measure',
  flavour: overrides.flavour || 'continuous',
  dataType: overrides.dataType || 'float',
  ...overrides,
});

describe('syntheticFields', () => {
  it('generates synthetic fields for an active group', () => {
    const baseFields = [
      buildField({ id: 'm1', columnName: 'Revenue', type: 'measure' }),
      buildField({ id: 'm2', columnName: 'Profit', type: 'measure' }),
    ];

    const synthetic = generateSyntheticFieldsForGroup(baseFields, ['Revenue', 'Profit']);

    expect(synthetic).toHaveLength(2);
    expect(synthetic[0].syntheticType).toBe('MeasureNames');
    expect(synthetic[1].syntheticType).toBe('MeasureValues');
  });

  it('generates synthetic fields using all measures when no group specified', () => {
    const baseFields = [
      buildField({ id: 'm1', columnName: 'Revenue', type: 'measure' }),
      buildField({ id: 'm2', columnName: 'Profit', type: 'measure' }),
      buildField({ id: 'd1', columnName: 'Region', type: 'dimension', flavour: 'discrete' }),
    ];

    // When measureNames is undefined or empty, should still generate synthetic fields
    const syntheticUndefined = generateSyntheticFieldsForGroup(baseFields, undefined);
    const syntheticEmpty = generateSyntheticFieldsForGroup(baseFields, []);

    expect(syntheticUndefined).toHaveLength(2);
    expect(syntheticUndefined[0].syntheticType).toBe('MeasureNames');
    expect(syntheticUndefined[1].syntheticType).toBe('MeasureValues');

    expect(syntheticEmpty).toHaveLength(2);
    expect(syntheticEmpty[0].syntheticType).toBe('MeasureNames');
    expect(syntheticEmpty[1].syntheticType).toBe('MeasureValues');
  });

  it('filters unpivot measures by group selection', () => {
    const fields = [
      buildField({ id: 'm1', columnName: 'Revenue', type: 'measure' }),
      buildField({ id: 'm2', columnName: 'Profit', type: 'measure' }),
      buildField({ id: 'd1', columnName: 'Region', type: 'dimension', flavour: 'discrete' }),
    ];

    const selected = getMeasureFieldsForUnpivot(fields, ['Profit']);

    expect(selected.map((f) => f.columnName)).toEqual(['Profit']);
  });

  it('returns no measures when group selection is empty', () => {
    const fields = [
      buildField({ id: 'm1', columnName: 'Revenue', type: 'measure' }),
      buildField({ id: 'm2', columnName: 'Profit', type: 'measure' }),
    ];

    const selected = getMeasureFieldsForUnpivot(fields, []);

    expect(selected).toHaveLength(0);
  });
});
