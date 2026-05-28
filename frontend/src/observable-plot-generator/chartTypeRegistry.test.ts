// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';
import {
  CHART_TYPE_REGISTRY,
  GRID_PLOT_CHART_TYPE_ORDER,
  getChartTypeDescriptor,
} from './chartTypeRegistry';

const measureField = (
  name: string,
  flavour: 'continuous' | 'discrete' = 'continuous',
): Field => ({
  id: `${name}-id`,
  columnName: name,
  type: 'measure',
  flavour,
  dataType: 'float',
});

const dimensionField = (
  name: string,
  flavour: 'continuous' | 'discrete' = 'discrete',
): Field => ({
  id: `${name}-id`,
  columnName: name,
  type: 'dimension',
  flavour,
  dataType: flavour === 'continuous' ? 'float' : 'string',
});

describe('chartTypeRegistry contract', () => {
  describe('getChartTypeDescriptor', () => {
    it('returns undefined for null / undefined (auto mode)', () => {
      expect(getChartTypeDescriptor(null)).toBeUndefined();
      expect(getChartTypeDescriptor(undefined)).toBeUndefined();
    });

    it('returns the descriptor whose id matches the requested chart type', () => {
      for (const key of Object.keys(CHART_TYPE_REGISTRY)) {
        const descriptor = getChartTypeDescriptor(key as never);
        expect(descriptor?.id).toBe(key);
      }
    });
  });

  describe('GRID_PLOT_CHART_TYPE_ORDER', () => {
    it('excludes "table-refactor" because it dispatches via a separate GridResultModel path', () => {
      expect(GRID_PLOT_CHART_TYPE_ORDER).not.toContain('table-refactor');
    });

    it('only lists chart types whose descriptor is flagged isGridChart', () => {
      for (const id of GRID_PLOT_CHART_TYPE_ORDER) {
        const descriptor = CHART_TYPE_REGISTRY[id];
        expect(descriptor).toBeDefined();
        expect(descriptor?.isGridChart).toBe(true);
      }
    });
  });

  describe('bumpsQueryVersion flag (used by SET_GLOBAL_CHART_TYPE)', () => {
    it('is set for chart types whose data path differs from the default pipeline', () => {
      expect(getChartTypeDescriptor('cdf')?.bumpsQueryVersion).toBe(true);
      expect(getChartTypeDescriptor('density')?.bumpsQueryVersion).toBe(true);
      expect(getChartTypeDescriptor('pie')?.bumpsQueryVersion).toBe(true);
    });

    it('is falsy for chart types that reuse the standard query result', () => {
      expect(getChartTypeDescriptor('heatmap')?.bumpsQueryVersion).toBeFalsy();
      expect(getChartTypeDescriptor('table-refactor')?.bumpsQueryVersion).toBeFalsy();
    });
  });

  describe('grain (used by buildViewSpec.deriveGrain)', () => {
    it('forces "cdf" grain for the cdf chart type', () => {
      expect(getChartTypeDescriptor('cdf')?.grain).toBe('cdf');
    });

    it('forces "rawRows" grain for density (KDE consumes raw values)', () => {
      expect(getChartTypeDescriptor('density')?.grain).toBe('rawRows');
    });

    it('does not force a grain for pie / heatmap / table-refactor', () => {
      expect(getChartTypeDescriptor('pie')?.grain).toBeUndefined();
      expect(getChartTypeDescriptor('heatmap')?.grain).toBeUndefined();
      expect(getChartTypeDescriptor('table-refactor')?.grain).toBeUndefined();
    });
  });

  describe('clearWhenNotAllowed (used by observablePlotGenerator fallback)', () => {
    it('pie clears globalChartType so the standard pipeline takes over when invalid', () => {
      expect(getChartTypeDescriptor('pie')?.clearWhenNotAllowed).toBe(true);
    });

    it('cdf, density, heatmap do NOT clear (they own their fallback rendering)', () => {
      expect(getChartTypeDescriptor('cdf')?.clearWhenNotAllowed).toBeFalsy();
      expect(getChartTypeDescriptor('density')?.clearWhenNotAllowed).toBeFalsy();
      expect(getChartTypeDescriptor('heatmap')?.clearWhenNotAllowed).toBeFalsy();
    });
  });

  describe('isAllowed predicates', () => {
    it('density: continuous dimension on X, no continuous on Y, no measures', () => {
      const age = dimensionField('age', 'continuous');
      const region = dimensionField('region');
      const revenue = measureField('revenue');
      const density = getChartTypeDescriptor('density')!;

      expect(density.isAllowed([age], [])).toBe(true);
      expect(density.isAllowed([age], [region])).toBe(true);
      expect(density.isAllowed([age, revenue], [])).toBe(false);
      expect(density.isAllowed([region], [])).toBe(false);
      expect(density.isAllowed([age], [dimensionField('y', 'continuous')])).toBe(false);
    });

    it('cdf: continuous measure on X, no continuous on Y, no continuous dim', () => {
      const revenue = measureField('revenue');
      const region = dimensionField('region');
      const cdf = getChartTypeDescriptor('cdf')!;

      expect(cdf.isAllowed([revenue], [])).toBe(true);
      expect(cdf.isAllowed([revenue], [region])).toBe(true);
      expect(cdf.isAllowed([region], [revenue])).toBe(false);
      expect(cdf.isAllowed([revenue, dimensionField('x', 'continuous')], [])).toBe(false);
    });

    it('pie: rejected only when BOTH axes carry a measure', () => {
      const revenue = measureField('revenue');
      const region = dimensionField('region');
      const pie = getChartTypeDescriptor('pie')!;

      expect(pie.isAllowed([region], [revenue])).toBe(true);
      expect(pie.isAllowed([revenue], [region])).toBe(true);
      expect(pie.isAllowed([revenue], [revenue])).toBe(false);
    });

    it('heatmap and table-refactor are always allowed (always return true)', () => {
      const revenue = measureField('revenue');
      const region = dimensionField('region');

      expect(getChartTypeDescriptor('heatmap')?.isAllowed([], [])).toBe(true);
      expect(getChartTypeDescriptor('heatmap')?.isAllowed([revenue, region], [region])).toBe(true);
      expect(getChartTypeDescriptor('table-refactor')?.isAllowed([], [])).toBe(true);
    });
  });
});
