// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
jest.mock('d3-geo', () => ({
  geoEqualEarth: () => {
    const scale = 10;
    return {
      fitExtent: () => {},
      fitWidth: () => {},
      invert: ([x, y]: [number, number]): [number, number] => [x / scale - 5, 50 - y / scale],
    };
  },
  geoPath: () => ({
    bounds: () => [[0, 0], [100, 55]] as [[number, number], [number, number]],
  }),
}));

import { panMapViewBounds } from './mapUtils';
import { fitMapProjectionToBounds, panMapViewBoundsFromPixelDelta } from './mapProjectionFit';

describe('mapProjectionFit', () => {
  const view: [number, number, number, number] = [-5, 45, 5, 55];
  const home: [number, number, number, number] = [-10, 40, 10, 60];
  const width = 400;
  const height = 300;

  test('panMapViewBoundsFromPixelDelta preserves geographic span', () => {
    const lonSpan = view[2] - view[0];
    const latSpan = view[3] - view[1];
    const panned = panMapViewBoundsFromPixelDelta(view, 40, -20, width, height, home);
    expect(panned[2] - panned[0]).toBeCloseTo(lonSpan, 5);
    expect(panned[3] - panned[1]).toBeCloseTo(latSpan, 5);
    expect(panned).not.toEqual(view);
  });

  test('panMapViewBoundsFromPixelDelta matches explicit lon/lat pan at center', () => {
    const projection = fitMapProjectionToBounds(view, width, height);
    const center = projection.invert!([width / 2, height / 2])!;
    const shifted = projection.invert!([width / 2 - 30, height / 2 + 10])!;
    const expected = panMapViewBounds(
      view,
      shifted[0] - center[0],
      shifted[1] - center[1],
      home,
    );
    expect(panMapViewBoundsFromPixelDelta(view, 30, -10, width, height, home)).toEqual(expected);
  });
});
