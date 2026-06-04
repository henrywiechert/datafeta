// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { resolveChartTypeParams, LegacyChartTypeParamFields } from './VisualizationProvider';
import { initialState } from './initialState';

describe('resolveChartTypeParams', () => {
  const base = initialState.chartTypeParams;

  it('returns defaults when source is undefined', () => {
    expect(resolveChartTypeParams(base, undefined)).toEqual(base);
  });

  it('returns defaults when source has neither grouped params nor legacy fields', () => {
    expect(resolveChartTypeParams(base, {})).toEqual(base);
  });

  it('uses grouped chartTypeParams when present', () => {
    const source: LegacyChartTypeParamFields = {
      chartTypeParams: {
        line: { variant: 'area', areaFillOpacity: 0.3, colorMode: 'alongPath' },
        distribution: { variant: 'box-plot' },
        table: { cellMode: 'text', page: 4 },
        density: base.density,
      },
    };

    const result = resolveChartTypeParams(base, source);

    expect(result.line).toEqual({ variant: 'area', areaFillOpacity: 0.3, colorMode: 'alongPath' });
    expect(result.distribution.variant).toBe('box-plot');
    expect(result.table).toEqual({ cellMode: 'text', page: 4 });
    expect(result.density).toEqual(base.density);
  });

  it('migrates legacy flat fields when grouped chartTypeParams is missing', () => {
    const source: LegacyChartTypeParamFields = {
      lineVariant: 'area',
      areaFillOpacity: 0.7,
      distributionVariant: 'box-plot',
      tableCellMode: 'symbol',
      tablePage: 5,
    };

    const result = resolveChartTypeParams(base, source);

    expect(result.line).toEqual({ variant: 'area', areaFillOpacity: 0.7, colorMode: 'alongPath' });
    expect(result.distribution.variant).toBe('box-plot');
    expect(result.table).toEqual({ cellMode: 'symbol', page: 5 });
  });

  it('prefers grouped values over legacy flat fields when both are present', () => {
    const source: LegacyChartTypeParamFields = {
      chartTypeParams: {
        line: { variant: 'area', areaFillOpacity: 0.25, colorMode: 'alongPath' },
        distribution: { variant: 'tick-strip' },
        table: { cellMode: 'auto', page: 0 },
        density: base.density,
      },
      lineVariant: 'line',
      areaFillOpacity: 0.9,
      distributionVariant: 'box-plot',
      tableCellMode: 'symbol',
      tablePage: 7,
    };

    const result = resolveChartTypeParams(base, source);

    expect(result.line).toEqual({ variant: 'area', areaFillOpacity: 0.25, colorMode: 'alongPath' });
    expect(result.distribution.variant).toBe('tick-strip');
    expect(result.table).toEqual({ cellMode: 'auto', page: 0 });
  });

  it('fills missing fields from defaults when partial grouped data is provided', () => {
    const source: LegacyChartTypeParamFields = {
      // Only `line` is supplied via grouped; everything else should default.
      chartTypeParams: { line: { variant: 'area', areaFillOpacity: 0.5, colorMode: 'alongPath' } },
    };

    const result = resolveChartTypeParams(base, source);

    expect(result.line).toEqual({ variant: 'area', areaFillOpacity: 0.5, colorMode: 'alongPath' });
    expect(result.distribution).toEqual(base.distribution);
    expect(result.table).toEqual(base.table);
    expect(result.density).toEqual(base.density);
  });

  it('falls back per-field when a grouped sub-object is partial', () => {
    // Edge case: grouped.line is present but missing `areaFillOpacity`.
    // Legacy `areaFillOpacity` is consulted next, then defaults.
    // Cast bypasses the structural type so we can simulate a sheet persisted
    // before the field existed.
    const source = {
      chartTypeParams: { line: { variant: 'area' } } as never,
      areaFillOpacity: 0.88,
    } as LegacyChartTypeParamFields;

    const result = resolveChartTypeParams(base, source);

    expect(result.line.variant).toBe('area');
    expect(result.line.areaFillOpacity).toBe(0.88);
  });

  it('does not mutate the base or the source', () => {
    const baseClone = JSON.parse(JSON.stringify(base));
    const source: LegacyChartTypeParamFields = {
      lineVariant: 'area',
      tableCellMode: 'symbol',
    };
    const sourceClone = JSON.parse(JSON.stringify(source));

    resolveChartTypeParams(base, source);

    expect(base).toEqual(baseClone);
    expect(source).toEqual(sourceClone);
  });
});
