// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';
import { lineColorSplitsSeries, shouldShowLineColorModeControl } from './lineColorEncoding';

const continuousField = {
  id: 'v',
  columnName: 'value',
  type: 'dimension',
  flavour: 'continuous',
} as Field;

const discreteField = {
  ...continuousField,
  id: 'c',
  columnName: 'category',
  flavour: 'discrete',
} as Field;

describe('lineColorEncoding', () => {
  test('lineColorSplitsSeries is true for discrete color', () => {
    expect(lineColorSplitsSeries(discreteField)).toBe(true);
    expect(lineColorSplitsSeries(discreteField, 'alongPath')).toBe(true);
  });

  test('lineColorSplitsSeries follows mode for continuous color', () => {
    expect(lineColorSplitsSeries(continuousField, 'alongPath')).toBe(false);
    expect(lineColorSplitsSeries(continuousField, 'bySeries')).toBe(true);
  });

  test('shouldShowLineColorModeControl only for line + continuous', () => {
    expect(shouldShowLineColorModeControl(continuousField, true)).toBe(true);
    expect(shouldShowLineColorModeControl(continuousField, false)).toBe(false);
    expect(shouldShowLineColorModeControl(discreteField, true)).toBe(false);
    expect(shouldShowLineColorModeControl(null, true)).toBe(false);
  });
});
