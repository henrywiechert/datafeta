// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
jest.mock('d3-geo', () => ({
  geoEqualEarth: () => ({
    fitExtent: () => {},
    fitWidth: () => {},
  }),
  geoPath: () => ({
    bounds: () => [[0, 0], [100, 55]] as [[number, number], [number, number]],
  }),
}));

import { applyMapViewToPlotOptions } from './mapRenderOptions';

describe('applyMapViewToPlotOptions', () => {
  const homeOptions = {
    projection: { type: 'equal-earth', domain: { type: 'Sphere' } },
    marks: [],
    __mapHomeBounds: [-180, -90, 180, 90] as [number, number, number, number],
    __mapCurrentView: [-180, -90, 180, 90] as [number, number, number, number],
    __mapAspectRatio: 0.5,
    __mapPlotId: 'map-r0-c0',
    __mapInteractive: true,
  };

  test('returns same reference when no override', () => {
    expect(applyMapViewToPlotOptions(homeOptions)).toBe(homeOptions);
  });

  test('narrows projection domain when view override is set', () => {
    const view: [number, number, number, number] = [-6, 50, 2, 58];
    const next = applyMapViewToPlotOptions(homeOptions, view);
    expect(next).not.toBe(homeOptions);
    expect((next.projection as any).domain.geometry.coordinates).toEqual([
      [-6, 50],
      [2, 50],
      [2, 58],
      [-6, 58],
    ]);
    expect(next.__mapCurrentView).toEqual(view);
  });
});
