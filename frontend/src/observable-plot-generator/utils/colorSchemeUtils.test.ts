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

describe('deriveColorScaleInfo ColorChannel overload', () => {
  const data = [{ value: 0 }, { value: 50 }, { value: 100 }];

  const channel = (over: Partial<ColorChannel>): ColorChannel => ({
    field: continuousField,
    scheme: 'blues',
    bias: 0,
    reversed: false,
    manual: '#000000',
    ...over,
  });

  test('object form equals positional form (scheme/bias/reversed matrix)', () => {
    const cases: Array<{ scheme: string; bias: number; reversed: boolean }> = [
      { scheme: 'blues', bias: 0, reversed: false },
      { scheme: 'blues', bias: 0, reversed: true },
      { scheme: 'viridis', bias: 0.5, reversed: false },
      { scheme: 'viridis', bias: -0.5, reversed: true },
    ];
    for (const c of cases) {
      const positional = deriveColorScaleInfo(data, continuousField, c.scheme, c.bias, c.reversed);
      const object = deriveColorScaleInfo(data, channel(c));
      // accessor/interpolate are functions; compare the serializable shape.
      expect(object?.kind).toBe(positional?.kind);
      expect(object?.domain).toEqual(positional?.domain);
      expect(object?.range).toEqual(positional?.range);
      expect(object?.rawMin).toEqual(positional?.rawMin);
      expect(object?.rawMax).toEqual(positional?.rawMax);
    }
  });

  test('object form returns null when channel field is null', () => {
    expect(deriveColorScaleInfo(data, channel({ field: null }))).toBeNull();
  });

  test('split-series gradient object form equals positional form', () => {
    const positional = deriveSplitSeriesGradientColorScale(data, continuousField, 'viridis', 0.25, true);
    const object = deriveSplitSeriesGradientColorScale(data, channel({ scheme: 'viridis', bias: 0.25, reversed: true }));
    expect(object?.kind).toBe(positional?.kind);
    expect(object?.domain).toEqual(positional?.domain);
    expect(object?.range).toEqual(positional?.range);
  });
});
