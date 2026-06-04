// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { deriveColorScaleInfo } from './colorSchemeUtils';
import { Field } from '../../types';

const continuousField: Field = {
  id: 'f1',
  columnName: 'value',
  type: 'dimension',
  flavour: 'continuous',
  dataType: 'float',
};

describe('deriveColorScaleInfo colorReversed', () => {
  const data = [
    { value: 0 },
    { value: 50 },
    { value: 100 },
  ];

  test('reverses continuous palette range when colorReversed is true', () => {
    const normal = deriveColorScaleInfo(data, continuousField, 'blues', 0, false);
    const reversed = deriveColorScaleInfo(data, continuousField, 'blues', 0, true);

    expect(normal?.kind).toBe('continuous');
    expect(reversed?.kind).toBe('continuous');
    expect(reversed?.range).toEqual([...(normal?.range ?? [])].reverse());
  });

  test('does not reverse categorical palettes', () => {
    const discreteField: Field = {
      ...continuousField,
      flavour: 'discrete',
    };
    const dataDiscrete = [
      { value: 'a' },
      { value: 'b' },
    ];

    const normal = deriveColorScaleInfo(dataDiscrete, discreteField, 'tableau10', 0, false);
    const reversed = deriveColorScaleInfo(dataDiscrete, discreteField, 'tableau10', 0, true);

    expect(normal?.range).toEqual(reversed?.range);
  });
});
