// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { resolvePlotSvg } from './resolvePlotSvg';

describe('resolvePlotSvg', () => {
  test('returns svg element directly', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(resolvePlotSvg(svg)).toBe(svg);
  });

  test('finds svg inside figure wrapper', () => {
    const figure = document.createElement('figure');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    figure.appendChild(svg);
    expect(resolvePlotSvg(figure)).toBe(svg);
  });

  test('returns null when no svg present', () => {
    const div = document.createElement('div');
    expect(resolvePlotSvg(div)).toBeNull();
  });
});
