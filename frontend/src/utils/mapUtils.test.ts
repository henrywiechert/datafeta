// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';
import {
  boundsToProjectionDomain,
  computeGeoBounds,
  fitMapDimensions,
  isMapAllowed,
  isValidGeoCoordinate,
  MAP_EQUAL_EARTH_ASPECT_RATIO,
  computeMapAspectRatioForBounds,
  clampMapViewBounds,
  computeMapHomeBounds,
  formatMapPlotId,
  MAP_WORLD_HOME_BOUNDS,
  panMapViewBounds,
  pickMapAxisFields,
  resolveMapAspectRatio,
  resolveMapProjectionDomain,
  shouldWarnGeoScatter,
  zoomMapViewBounds,
} from './mapUtils';

function contDim(name: string, axis?: 'x' | 'y'): Field {
  return {
    id: `${name}-id`,
    columnName: name,
    type: 'dimension',
    flavour: 'continuous',
    dataType: 'float',
    axis,
  };
}

describe('mapUtils', () => {
  test('pickMapAxisFields uses innermost continuous numeric dims', () => {
    const region = {
      id: 'region-id',
      columnName: 'region',
      type: 'dimension' as const,
      flavour: 'discrete' as const,
      dataType: 'string' as const,
    };
    const lon = contDim('longitude');
    const lat = contDim('latitude');
    expect(pickMapAxisFields([region, lon], [region, lat])).toEqual({ lonField: lon, latField: lat });
  });

  test('isMapAllowed rejects measure on both axes', () => {
    const lon = contDim('longitude');
    const lat = contDim('latitude');
    const revenue = {
      id: 'rev-id',
      columnName: 'revenue',
      type: 'measure' as const,
      flavour: 'continuous' as const,
      dataType: 'float' as const,
      aggregation: 'sum' as const,
    };
    expect(isMapAllowed([lon], [lat])).toBe(true);
    expect(isMapAllowed([lon, revenue], [lat, revenue])).toBe(false);
  });

  test('shouldWarnGeoScatter only when names look geo and chart type is not map', () => {
    const lon = contDim('longitude');
    const lat = contDim('latitude');
    expect(shouldWarnGeoScatter(null, [lon], [lat])).toBe(true);
    expect(shouldWarnGeoScatter('scatter', [lon], [lat])).toBe(true);
    expect(shouldWarnGeoScatter('map', [lon], [lat])).toBe(false);
    expect(shouldWarnGeoScatter(null, [contDim('x_value')], [contDim('y_value')])).toBe(false);
  });

  test('computeGeoBounds pads single-point facets', () => {
    const bounds = computeGeoBounds([{ lon: 10, lat: 20 }], 'lon', 'lat');
    expect(bounds).not.toBeNull();
    expect(bounds![0]).toBeLessThan(10);
    expect(bounds![2]).toBeGreaterThan(10);
    expect(bounds![1]).toBeLessThan(20);
    expect(bounds![3]).toBeGreaterThan(20);
  });

  test('boundsToProjectionDomain uses MultiPoint corners (Polygon breaks Plot domain fit)', () => {
    const domain = boundsToProjectionDomain([-6, 50, 2, 58]);
    expect(domain.geometry.type).toBe('MultiPoint');
    expect(domain.geometry.coordinates).toHaveLength(4);
  });

  test('computeMapAspectRatioForBounds reflects regional extent, not whole world', () => {
    const gb = computeMapAspectRatioForBounds([-6, 50, 2, 58]);
    expect(gb).not.toBeCloseTo(MAP_EQUAL_EARTH_ASPECT_RATIO, 2);
    expect(gb).toBeGreaterThan(0.2);
    expect(gb).toBeLessThan(5);
  });

  test('fitMapDimensions preserves world aspect ratio and fills the limiting axis', () => {
    const wide = fitMapDimensions(800, 400, MAP_EQUAL_EARTH_ASPECT_RATIO);
    expect(wide.width).toBe(800);
    expect(wide.height).toBe(Math.round(800 * MAP_EQUAL_EARTH_ASPECT_RATIO));

    const tall = fitMapDimensions(400, 800, MAP_EQUAL_EARTH_ASPECT_RATIO);
    expect(tall.width).toBe(400);
    expect(tall.height).toBe(Math.round(400 * MAP_EQUAL_EARTH_ASPECT_RATIO));
  });

  test('isValidGeoCoordinate rejects out-of-range values', () => {
    expect(isValidGeoCoordinate(0, 0)).toBe(true);
    expect(isValidGeoCoordinate(181, 0)).toBe(false);
    expect(isValidGeoCoordinate(0, 91)).toBe(false);
    expect(isValidGeoCoordinate(Number.NaN, 0)).toBe(false);
  });

  test('resolveMapProjectionDomain switches between data bounds and Sphere', () => {
    const bounds: [number, number, number, number] = [-6, 50, 2, 58];
    const dataDomain = resolveMapProjectionDomain(bounds, 'data');
    expect('geometry' in dataDomain && dataDomain.geometry.type).toBe('MultiPoint');
    expect(resolveMapProjectionDomain(bounds, 'world')).toEqual({ type: 'Sphere' });
  });

  test('resolveMapAspectRatio uses world ratio only in world mode', () => {
    const bounds: [number, number, number, number] = [-6, 50, 2, 58];
    expect(resolveMapAspectRatio(bounds, 'world')).toBeCloseTo(MAP_EQUAL_EARTH_ASPECT_RATIO, 4);
    expect(resolveMapAspectRatio(bounds, 'data')).toBe(computeMapAspectRatioForBounds(bounds));
  });

  test('computeMapHomeBounds uses data bounds or full WGS84 extent', () => {
    const bounds: [number, number, number, number] = [-6, 50, 2, 58];
    expect(computeMapHomeBounds(bounds, 'data')).toEqual(bounds);
    expect(computeMapHomeBounds(bounds, 'world')).toEqual(MAP_WORLD_HOME_BOUNDS);
  });

  test('formatMapPlotId matches facet grid id convention', () => {
    expect(formatMapPlotId({ row: 0, col: 0 }, false)).toBe('map');
    expect(formatMapPlotId({ row: 1, col: 2 }, true)).toBe('map-r1-c2');
  });

  test('zoomMapViewBounds narrows bbox around anchor', () => {
    const home: [number, number, number, number] = [-10, 40, 10, 60];
    const view: [number, number, number, number] = [-5, 45, 5, 55];
    const zoomed = zoomMapViewBounds(view, 2, [0, 50], home);
    expect(zoomed[2] - zoomed[0]).toBeLessThan(view[2] - view[0]);
    expect(zoomed[3] - zoomed[1]).toBeLessThan(view[3] - view[1]);
  });

  test('panMapViewBounds shifts bbox and clamps to padded home', () => {
    const home: [number, number, number, number] = [-10, 40, 10, 60];
    const view: [number, number, number, number] = [-5, 45, 5, 55];
    const panned = panMapViewBounds(view, 2, 1, home);
    expect(panned[0]).toBeCloseTo(-3, 5);
    expect(panned[1]).toBeCloseTo(46, 5);
  });

  test('clampMapViewBounds rejects degenerate results', () => {
    const home: [number, number, number, number] = [-10, 40, 10, 60];
    const collapsed = clampMapViewBounds([0, 0, 0, 0], home);
    expect(collapsed).toEqual(home);
  });
});
