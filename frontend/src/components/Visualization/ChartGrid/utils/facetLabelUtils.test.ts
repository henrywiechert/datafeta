// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  computeProductSegments,
  formatFacetAxisTitle,
  formatFacetValue,
  getOrientationStyles,
  resolveDepthValue,
  resolveFlexAlignment,
  resolveTextAlignment,
  updateDepthOverride,
} from './facetLabelUtils';

describe('facetLabelUtils', () => {
  test('formats hierarchical facet axis titles', () => {
    expect(formatFacetAxisTitle(undefined)).toBe('');
    expect(formatFacetAxisTitle([])).toBe('');
    expect(formatFacetAxisTitle([{ fieldLabel: 'Region' }])).toBe('Region');
    expect(formatFacetAxisTitle([
      { fieldLabel: 'Region' },
      { fieldLabel: 'Category' },
      { fieldLabel: 'Sub.Category_Name' },
    ])).toBe('Region | Category | Sub.Category_Name');
  });

  test('formats dates and plain values', () => {
    expect(formatFacetValue(new Date('2024-01-02T00:00:00.000Z'))).toContain('2024');
    expect(formatFacetValue('East')).toBe('East');
    expect(formatFacetValue(42)).toBe('42');
  });

  test('computes fallback product segments', () => {
    const segments = computeProductSegments(
      [
        { values: ['East', 'West'] },
        { values: ['A', 'B'] },
      ],
      0,
      1,
    );

    expect(segments).toEqual([
      { value: 'East', startIndex: 1, span: 2, firstTupleIndex: 0 },
      { value: 'West', startIndex: 3, span: 2, firstTupleIndex: 2 },
    ]);
  });

  test('returns orientation styles for vertical and angled text', () => {
    expect(getOrientationStyles('vertical', 12)).toMatchObject({
      writingMode: 'vertical-rl',
      transform: 'rotate(180deg)',
      fontSize: '12px',
    });
    expect(getOrientationStyles('angled', 10)).toMatchObject({
      transform: 'rotate(-45deg)',
      fontSize: '10px',
    });
  });

  test('resolves depth values via depth, shared, then fallback', () => {
    expect(resolveDepthValue(['start', 'end'], 'center', 1, 'center')).toBe('end');
    expect(resolveDepthValue(undefined, 'center', 1, 'start')).toBe('center');
    expect(resolveDepthValue(undefined, undefined, 1, 'start')).toBe('start');
  });

  test('maps flex and text alignments', () => {
    expect(resolveFlexAlignment('start')).toBe('flex-start');
    expect(resolveFlexAlignment('end')).toBe('flex-end');
    expect(resolveTextAlignment('start')).toBe('left');
    expect(resolveTextAlignment('end')).toBe('right');
  });

  test('updates depth overrides without changing identical entries', () => {
    const unchanged = ['wrap'];
    expect(updateDepthOverride(unchanged, 0, 'wrap')).toBe(unchanged);
    expect(updateDepthOverride(['wrap'], 1, 'nowrap')).toEqual(['wrap', 'nowrap']);
  });
});
