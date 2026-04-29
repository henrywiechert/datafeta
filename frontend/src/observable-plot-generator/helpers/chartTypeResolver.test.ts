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

describe('detectDefaultUserChartType (PR 9)', () => {
  test('routes to heatmap on 1 discrete X dim, 1 discrete Y dim, measure on color', () => {
    const result = detectDefaultUserChartType(
      [dim('region')],
      [dim('product')],
      meas('sales')
    );
    expect(result).toBe('heatmap');
  });

  test('returns null when there is no color field', () => {
    const result = detectDefaultUserChartType([dim('region')], [dim('product')], null);
    expect(result).toBeNull();
  });

  test('returns null when color field is a dimension, not a measure', () => {
    const result = detectDefaultUserChartType(
      [dim('region')],
      [dim('product')],
      dim('segment')
    );
    expect(result).toBeNull();
  });

  test('returns null when X has more than one dimension', () => {
    const result = detectDefaultUserChartType(
      [dim('region'), dim('subregion')],
      [dim('product')],
      meas('sales')
    );
    expect(result).toBeNull();
  });

  test('returns null when Y has more than one dimension', () => {
    const result = detectDefaultUserChartType(
      [dim('region')],
      [dim('product'), dim('subproduct')],
      meas('sales')
    );
    expect(result).toBeNull();
  });

  test('returns null when X is a continuous dimension', () => {
    const result = detectDefaultUserChartType(
      [dim('age', 'continuous')],
      [dim('product')],
      meas('sales')
    );
    expect(result).toBeNull();
  });

  test('returns null when Y is a continuous dimension', () => {
    const result = detectDefaultUserChartType(
      [dim('region')],
      [dim('age', 'continuous')],
      meas('sales')
    );
    expect(result).toBeNull();
  });

  test('returns null when X is a measure (heatmap requires dim on X)', () => {
    const result = detectDefaultUserChartType(
      [meas('sales')],
      [dim('product')],
      meas('profit')
    );
    expect(result).toBeNull();
  });

  test('returns null when Y is a measure (heatmap requires dim on Y)', () => {
    const result = detectDefaultUserChartType(
      [dim('region')],
      [meas('sales')],
      meas('profit')
    );
    expect(result).toBeNull();
  });

  test('returns null on empty fields', () => {
    expect(detectDefaultUserChartType([], [], meas('sales'))).toBeNull();
    expect(detectDefaultUserChartType(undefined, undefined, meas('sales'))).toBeNull();
  });
});

describe('mapUserChartTypeToCellChartType heatmap mapping (PR 9)', () => {
  test("maps user 'heatmap' to cell 'heatmap' regardless of axis", () => {
    const xf = dim('region');
    const yf = dim('product');
    expect(mapUserChartTypeToCellChartType('heatmap', 'x', xf, yf)).toBe('heatmap');
    expect(mapUserChartTypeToCellChartType('heatmap', 'y', xf, yf)).toBe('heatmap');
  });
});

describe('per-pair auto-detection sanity (PR 9 — unchanged behaviour)', () => {
  test('falls through to dot for two discrete dims at the pair level', () => {
    // Heatmap auto-routing happens at the *user* level with color context;
    // per-pair detection (no color awareness) still returns 'dot' as before.
    expect(detectDefaultChartTypeForPair(dim('region'), dim('product'))).toBe('dot');
  });
});
