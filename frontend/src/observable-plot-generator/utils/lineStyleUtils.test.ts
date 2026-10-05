// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  buildLineStyleEncoding,
  deriveLineStyleScale,
  getLineStyleDashArray,
  getLineStyleForValue,
  LINE_STYLES,
  LINE_STYLE_OTHER,
  LineStyleName,
  resolveManualLineStyle,
} from './lineStyleUtils';
import { Field } from '../../types';

const field: Field = {
  id: 'channel-id',
  columnName: 'channel',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

describe('lineStyleUtils', () => {
  it('draws solid lines without a dash pattern and every other style with a distinct one', () => {
    expect(getLineStyleDashArray('solid')).toBeUndefined();
    const dashed: LineStyleName[] = [...LINE_STYLES.filter((s) => s !== 'solid'), LINE_STYLE_OTHER];
    const patterns = dashed.map(getLineStyleDashArray);
    expect(patterns.every(Boolean)).toBe(true);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it('falls back to solid for unknown manual styles', () => {
    expect(resolveManualLineStyle('dotted')).toBe('dotted');
    expect(resolveManualLineStyle('bogus')).toBe('solid');
    expect(resolveManualLineStyle(undefined)).toBe('solid');
  });

  it('gives the top five values their own style and buckets the rest into Other', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((channel) => ({ channel }));
    const scale = deriveLineStyleScale(rows, field);

    expect(scale.domain).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(['a', 'b', 'c', 'd', 'e'].map((v) => getLineStyleForValue(v, scale))).toEqual([...LINE_STYLES]);
    expect(getLineStyleForValue('f', scale)).toBe(LINE_STYLE_OTHER);
  });

  it('builds a scale only when a field is assigned', () => {
    expect(buildLineStyleEncoding(undefined, 'dashed', []).scale).toBeNull();
    expect(buildLineStyleEncoding(field, 'dashed', [{ channel: 'a' }]).scale?.domain).toEqual(['a']);
  });
});
