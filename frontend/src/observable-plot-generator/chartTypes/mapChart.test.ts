// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { ChartGenerationContext } from '../types';
import { buildMapOptions, generateMapGrid } from './mapChart';

jest.mock('@observablehq/plot', () => ({
  geo: (data: any, opts: any) => ({ type: 'geo', data, opts }),
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
}));

function contDim(name: string): Field {
  return {
    id: `${name}-id`,
    columnName: name,
    type: 'dimension',
    flavour: 'continuous',
    dataType: 'float',
  } as Field;
}

const SAMPLE_ROWS = [
  { longitude: -74.006, latitude: 40.7128, city: 'NYC' },
  { longitude: -118.2437, latitude: 34.0522, city: 'LA' },
];

describe('buildMapOptions', () => {
  test('uses projection with geo outline and dot marks for valid coordinates', () => {
    const opts = buildMapOptions({
      data: SAMPLE_ROWS,
      lonField: contDim('longitude'),
      latField: contDim('latitude'),
      color: { field: null, scheme: '', bias: 0, reversed: false, manual: '' },
    });

    expect((opts.projection as any)?.type).toBe('equal-earth');
    expect((opts.projection as any)?.domain?.geometry?.type).toBe('MultiPoint');
    expect(opts.marks).toHaveLength(2);
    expect((opts.marks as any[])[0].type).toBe('geo');
    expect((opts.marks as any[])[1].type).toBe('dot');
    expect(opts.caption).toContain('Natural Earth');
    expect((opts as any).__mapAspectRatio).toBeGreaterThan(0);
    expect((opts as any).__mapInteractive).toBe(true);
    expect((opts as any).__mapPlotId).toBe('map');
    expect((opts as any).__mapHomeBounds).toEqual(
      expect.arrayContaining([expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)]),
    );
  });

  test('shows message when no valid coordinates remain', () => {
    const opts = buildMapOptions({
      data: [{ longitude: 999, latitude: 0 }],
      lonField: contDim('longitude'),
      latField: contDim('latitude'),
      color: { field: null, scheme: '', bias: 0, reversed: false, manual: '' },
    });
    expect((opts.marks as any[])[0].type).toBe('text');
  });

  test('uses Sphere domain and world aspect ratio in world extent mode', () => {
    const opts = buildMapOptions({
      data: SAMPLE_ROWS,
      lonField: contDim('longitude'),
      latField: contDim('latitude'),
      color: { field: null, scheme: '', bias: 0, reversed: false, manual: '' },
      extentMode: 'world',
    });

    expect((opts.projection as any)?.domain).toEqual({ type: 'Sphere' });
    expect((opts as any).__mapAspectRatio).toBeCloseTo(2.6347 / 5.4133, 4);
    expect((opts as any).__mapHomeBounds).toEqual([-180, -90, 180, 90]);
  });

  test('viewBounds override narrows projection domain MultiPoint corners', () => {
    const gbView: [number, number, number, number] = [-6, 50, 2, 58];
    const opts = buildMapOptions({
      data: SAMPLE_ROWS,
      lonField: contDim('longitude'),
      latField: contDim('latitude'),
      color: { field: null, scheme: '', bias: 0, reversed: false, manual: '' },
      extentMode: 'world',
      viewBounds: gbView,
      plotId: 'map-r0-c0',
    });

    expect((opts.projection as any)?.domain?.geometry?.coordinates).toEqual([
      [-6, 50],
      [2, 50],
      [2, 58],
      [-6, 58],
    ]);
    expect((opts as any).__mapPlotId).toBe('map-r0-c0');
    expect((opts as any).__mapHomeBounds).toEqual([-180, -90, 180, 90]);
  });
});

describe('generateMapGrid', () => {
  test('returns message chart when axes are not geo-capable', () => {
    const context = {
      xFields: [],
      yFields: [contDim('latitude')],
      queryResult: { rows: SAMPLE_ROWS, columns: [], row_count: 2 },
    } as ChartGenerationContext;
    const result = generateMapGrid(context);
    expect(result.plots[0].id).toBe('map-message');
  });

  test('renders a single map cell for lon/lat axes', () => {
    const context = {
      xFields: [contDim('longitude')],
      yFields: [contDim('latitude')],
      queryResult: { rows: SAMPLE_ROWS, columns: [], row_count: 2 },
      tooltipFields: [],
      labelFields: [],
    } as ChartGenerationContext;
    const result = generateMapGrid(context);
    expect(result.plots[0].id).toBe('map');
    expect(result.layout.columnSizes).toEqual(['fr']);
    expect(result.layout.rowSizes).toEqual(['fr']);
    expect((result.plots[0].options as any).__mapInteractive).toBe(true);
    expect((result.plots[0].options as any).__mapPlotId).toBe('map');
  });

  test('applies transient view bounds from context mapViewByPlotId', () => {
    const gbView: [number, number, number, number] = [-6, 50, 2, 58];
    const context = {
      xFields: [contDim('longitude')],
      yFields: [contDim('latitude')],
      queryResult: { rows: SAMPLE_ROWS, columns: [], row_count: 2 },
      tooltipFields: [],
      labelFields: [],
      mapViewByPlotId: { map: gbView },
    } as ChartGenerationContext;
    const result = generateMapGrid(context);
    expect((result.plots[0].options as any).projection.domain.geometry.coordinates).toEqual([
      [-6, 50],
      [2, 50],
      [2, 58],
      [-6, 58],
    ]);
  });
});
