// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { isPlotDataMarkElement } from './plotMarkUtils';

describe('isPlotDataMarkElement', () => {
  test('returns true for elements with object __data__', () => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    (circle as any).__data__ = { city: 'NYC' };
    expect(isPlotDataMarkElement(circle)).toBe(true);
  });

  test('returns true for elements with numeric row index __data__', () => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    (circle as any).__data__ = 3;
    expect(isPlotDataMarkElement(circle)).toBe(true);
  });

  test('returns false for geo paths without row data', () => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    expect(isPlotDataMarkElement(path)).toBe(false);
  });
});
