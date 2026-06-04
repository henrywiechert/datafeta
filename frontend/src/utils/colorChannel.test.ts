// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { resolveColorChannel } from './colorChannel';
import { ColorChannel, Field, FieldOverrideState } from '../types';
import { DEFAULT_MANUAL_COLOR, DEFAULT_CATEGORICAL_SCHEME } from '../config/colorSchemes';

const globalField: Field = {
  id: 'g',
  columnName: 'g',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const overrideField: Field = {
  id: 'o',
  columnName: 'o',
  type: 'dimension',
  flavour: 'continuous',
  dataType: 'float',
};

const baseGlobal: ColorChannel = {
  field: globalField,
  scheme: 'viridis',
  bias: 0.5,
  reversed: true,
  manual: '#abcdef',
};

/**
 * Reference implementations copied verbatim from the pre-refactor call sites in
 * FieldOverridesPanel. resolveColorChannel must produce identical values.
 */
function legacyEffective(global: ColorChannel, override: FieldOverrideState) {
  return {
    manual: override.manualColor || global.manual || DEFAULT_MANUAL_COLOR,
    scheme: override.colorScheme || global.scheme || 'tableau10',
    bias: override.colorBias ?? global.bias ?? 0,
    reversed: override.colorReversed ?? global.reversed ?? false,
  };
}

describe('resolveColorChannel', () => {
  test('override values win over global', () => {
    const override: FieldOverrideState = {
      colorScheme: 'plasma',
      colorBias: -0.25,
      colorReversed: false,
      manualColor: '#111111',
    };
    const result = resolveColorChannel(baseGlobal, override, overrideField);
    expect(result.scheme).toBe('plasma');
    expect(result.bias).toBe(-0.25);
    expect(result.reversed).toBe(false);
    expect(result.manual).toBe('#111111');
    expect(result.field).toBe(overrideField);
  });

  test('falls back to global when override is empty', () => {
    const result = resolveColorChannel(baseGlobal, {});
    expect(result.scheme).toBe('viridis');
    expect(result.bias).toBe(0.5);
    expect(result.reversed).toBe(true);
    expect(result.manual).toBe('#abcdef');
    expect(result.field).toBe(globalField);
  });

  test('falls back to defaults when global is empty', () => {
    const emptyGlobal: ColorChannel = {
      field: null,
      scheme: '',
      bias: 0,
      reversed: false,
      manual: '',
    };
    const result = resolveColorChannel(emptyGlobal);
    expect(result.scheme).toBe(DEFAULT_CATEGORICAL_SCHEME);
    expect(result.manual).toBe(DEFAULT_MANUAL_COLOR);
    expect(result.bias).toBe(0);
    expect(result.reversed).toBe(false);
    expect(result.field).toBeNull();
  });

  test('explicit falsy bias/reversed override is honored (?? semantics)', () => {
    const override: FieldOverrideState = { colorBias: 0, colorReversed: false };
    const result = resolveColorChannel(baseGlobal, override);
    expect(result.bias).toBe(0);
    expect(result.reversed).toBe(false);
  });

  test('empty-string scheme/manual override defers to global (|| semantics)', () => {
    const override: FieldOverrideState = { colorScheme: '', manualColor: '' };
    const result = resolveColorChannel(baseGlobal, override);
    expect(result.scheme).toBe('viridis');
    expect(result.manual).toBe('#abcdef');
  });

  test('field param: null forces no field, undefined inherits global', () => {
    expect(resolveColorChannel(baseGlobal, {}, null).field).toBeNull();
    expect(resolveColorChannel(baseGlobal, {}, overrideField).field).toBe(overrideField);
    expect(resolveColorChannel(baseGlobal, {}).field).toBe(globalField);
  });

  test('matches the legacy inline precedence across a case matrix', () => {
    const overrides: FieldOverrideState[] = [
      {},
      { colorScheme: 'plasma' },
      { colorBias: 0 },
      { colorReversed: false },
      { colorReversed: true },
      { manualColor: '#222' },
      { colorScheme: '', colorBias: 1.5, colorReversed: false, manualColor: '' },
    ];
    for (const ov of overrides) {
      const expected = legacyEffective(baseGlobal, ov);
      const actual = resolveColorChannel(baseGlobal, ov);
      expect({
        scheme: actual.scheme,
        bias: actual.bias,
        reversed: actual.reversed,
        manual: actual.manual,
      }).toEqual(expected);
    }
  });
});
