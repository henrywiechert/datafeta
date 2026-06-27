// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import {
  detectDefaultChartTypeForPair,
  detectDefaultUserChartType,
  mapUserChartTypeToCellChartType,
} from './chartTypeResolver';

function dim(columnName: string, flavour: 'discrete' | 'continuous' = 'discrete'): Field {
  return {
    id: `dim-${columnName}-${flavour}`,
    columnName,
    type: 'dimension',
    flavour,
    dataType: flavour === 'continuous' ? 'float' : 'string',
  } as Field;
}

function meas(columnName: string, aggregation: any = 'sum'): Field {
  return {
    id: `meas-${columnName}-${aggregation}`,
    columnName,
    type: 'measure',
    flavour: 'continuous',
    dataType: 'float',
    aggregation,
  } as Field;
}

describe('detectDefaultUserChartType (PR 10 — consolidated source of truth)', () => {
  describe('empty inputs', () => {
    test('returns null when both axes are empty', () => {
      expect(detectDefaultUserChartType([], [], meas('sales'))).toBeNull();
      expect(detectDefaultUserChartType(undefined, undefined, meas('sales'))).toBeNull();
    });
  });

  describe('heatmap rule', () => {
    test('routes to heatmap on 1 discrete X dim, 1 discrete Y dim, measure on color', () => {
      expect(
        detectDefaultUserChartType([dim('region')], [dim('product')], meas('sales'))
      ).toBe('heatmap');
    });

    test('does NOT route to heatmap when there is no color field (falls through to table-refactor)', () => {
      expect(
        detectDefaultUserChartType([dim('region')], [dim('product')], null)
      ).toBe('table-refactor');
    });

    test('does NOT route to heatmap when color is a dimension (falls through to table-refactor)', () => {
      expect(
        detectDefaultUserChartType([dim('region')], [dim('product')], dim('segment'))
      ).toBe('table-refactor');
    });

    test('does NOT route to heatmap when X has more than one discrete dim', () => {
      // All-discrete shape → table-refactor.
      expect(
        detectDefaultUserChartType(
          [dim('region'), dim('subregion')],
          [dim('product')],
          meas('sales'),
        )
      ).toBe('table-refactor');
    });

    test('does NOT route to heatmap when X is a continuous dimension (falls through to tick)', () => {
      expect(
        detectDefaultUserChartType(
          [dim('age', 'continuous')],
          [dim('product')],
          meas('sales'),
        )
      ).toBe('tick');
    });
  });

  describe('cartesian rule (continuous candidates on both axes → per-pair mapping)', () => {
    test('measure on X, measure on Y → scatter', () => {
      expect(
        detectDefaultUserChartType([meas('a')], [meas('b')], null)
      ).toBe('scatter');
    });

    test('measure on X, discrete dim on Y → bar', () => {
      // discrete dim on Y is not a "continuous candidate", so this falls into
      // the "single-axis" branch below (hasMeasures → bar).
      expect(
        detectDefaultUserChartType([meas('a')], [dim('region')], null)
      ).toBe('bar');
    });

    test('measure on X, continuous dim on Y → line', () => {
      expect(
        detectDefaultUserChartType([meas('a')], [dim('time', 'continuous')], null)
      ).toBe('line');
    });

    test('continuous dim on X, measure on Y → line', () => {
      expect(
        detectDefaultUserChartType([dim('time', 'continuous')], [meas('a')], null)
      ).toBe('line');
    });
  });

  describe('single-axis / dim-only fallbacks', () => {
    test('measure on X only → bar', () => {
      expect(
        detectDefaultUserChartType([meas('sales')], [], null)
      ).toBe('bar');
    });

    test('continuous dim on X only, no measures → tick', () => {
      expect(
        detectDefaultUserChartType([dim('time', 'continuous')], [], null)
      ).toBe('tick');
    });

    test('continuous dim on Y only, no measures → tick', () => {
      expect(
        detectDefaultUserChartType([], [dim('time', 'continuous')], null)
      ).toBe('tick');
    });

    test('discrete dim on X only, no measures → table-refactor', () => {
      expect(
        detectDefaultUserChartType([dim('region')], [], null)
      ).toBe('table-refactor');
    });
  });
});

describe('mapUserChartTypeToCellChartType heatmap mapping', () => {
  test("maps user 'heatmap' to cell 'heatmap' regardless of axis", () => {
    const xf = dim('region');
    const yf = dim('product');
    expect(mapUserChartTypeToCellChartType('heatmap', 'x', xf, yf)).toBe('heatmap');
    expect(mapUserChartTypeToCellChartType('heatmap', 'y', xf, yf)).toBe('heatmap');
  });
  test("maps user 'density' to cell 'density' regardless of axis", () => {
    const xf = dim('age', 'continuous');
    expect(mapUserChartTypeToCellChartType('density', 'x', xf, xf)).toBe('density');
  });
});

describe('per-pair auto-detection sanity', () => {
  test('falls through to dot for two discrete dims at the pair level', () => {
    // Per-pair detection (no color awareness) still returns 'dot' as before;
    // the heatmap rule lives in detectDefaultUserChartType, not here.
    expect(detectDefaultChartTypeForPair(dim('region'), dim('product'))).toBe('dot');
  });
});
