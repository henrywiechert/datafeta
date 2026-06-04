// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { deriveColorScaleInfo, deriveSplitSeriesGradientColorScale } from './colorSchemeUtils';
import { ColorChannel, Field } from '../../types';

const continuousField: Field = {
  id: 'f1',
  columnName: 'value',
  type: 'dimension',
  flavour: 'continuous',
  dataType: 'float',
};

const channel = (over: Partial<ColorChannel>): ColorChannel => ({
  field: continuousField,
  scheme: 'blues',
  bias: 0,
  reversed: false,
  manual: '#000000',
  ...over,
});

describe('deriveColorScaleInfo colorReversed', () => {
  const data = [
    { value: 0 },
    { value: 50 },
    { value: 100 },
  ];

  test('reverses continuous palette range when reversed is true', () => {
    const normal = deriveColorScaleInfo(data, channel({ scheme: 'blues', reversed: false }));
    const reversed = deriveColorScaleInfo(data, channel({ scheme: 'blues', reversed: true }));

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
    const discreteChannel = (reversed: boolean): ColorChannel => ({
      field: discreteField,
      scheme: 'tableau10',
      bias: 0,
      reversed,
      manual: '#000000',
    });

    const normal = deriveColorScaleInfo(dataDiscrete, discreteChannel(false));
    const reversed = deriveColorScaleInfo(dataDiscrete, discreteChannel(true));

    expect(normal?.range).toEqual(reversed?.range);
  });
});

describe('deriveColorScaleInfo ColorChannel form', () => {
  const data = [{ value: 0 }, { value: 50 }, { value: 100 }];

  test('reversed flips the continuous range; bias leaves domain/range unchanged', () => {
    const base = deriveColorScaleInfo(data, channel({ scheme: 'viridis', bias: 0, reversed: false }));
    const reversed = deriveColorScaleInfo(data, channel({ scheme: 'viridis', bias: 0, reversed: true }));
    const biased = deriveColorScaleInfo(data, channel({ scheme: 'viridis', bias: 0.5, reversed: false }));

    expect(base?.kind).toBe('continuous');
    expect(reversed?.range).toEqual([...(base?.range ?? [])].reverse());
    // Bias affects the interpolation curve, not the domain or the base range.
    expect(biased?.domain).toEqual(base?.domain);
    expect(biased?.range).toEqual(base?.range);
  });

  test('returns null when channel field is null', () => {
    expect(deriveColorScaleInfo(data, channel({ field: null }))).toBeNull();
  });

  test('split-series gradient derives a seriesGradient from the channel', () => {
    const result = deriveSplitSeriesGradientColorScale(data, channel({ scheme: 'viridis', bias: 0.25, reversed: true }));
    const base = deriveColorScaleInfo(data, channel({ scheme: 'viridis', bias: 0.25, reversed: true }));

    expect(result?.kind).toBe('seriesGradient');
    expect(result?.domain).toEqual(base?.domain);
    expect(result?.range).toEqual(base?.range);
  });
});
