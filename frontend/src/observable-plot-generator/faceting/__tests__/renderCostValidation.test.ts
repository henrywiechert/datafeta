// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../../types';
import { ChartGenerationContext } from '../../types';
import { validateRenderCost } from '../renderCostValidation';

function discreteDimension(columnName: string): Field {
  return {
    id: columnName,
    columnName,
    type: 'dimension',
    flavour: 'discrete',
    dataType: 'string',
  };
}

function continuousDimension(columnName: string): Field {
  return {
    id: columnName,
    columnName,
    type: 'dimension',
    flavour: 'continuous',
    dataType: 'float',
  };
}

function measure(columnName: string): Field {
  return {
    id: columnName,
    columnName,
    type: 'measure',
    flavour: 'continuous',
    dataType: 'float',
    aggregation: 'sum',
  };
}

function context(overrides: Partial<ChartGenerationContext>): ChartGenerationContext {
  return {
    xFields: [],
    yFields: [],
    color: { field: null, scheme: '', bias: 0, reversed: false, manual: '' },
    queryResult: { columns: [], rows: [], row_count: 0 },
    ...overrides,
  };
}

describe('validateRenderCost', () => {
  test('does not apply series or marks limits to scatter charts', () => {
    const colorField = discreteDimension('series');
    const rows = Array.from({ length: 400 }, (_, i) => ({
      x: i,
      y: i * 2,
      series: `S${i}`,
    }));

    const result = validateRenderCost(
      context({
        xFields: [continuousDimension('x')],
        yFields: [continuousDimension('y')],
        color: { field: colorField, scheme: '', bias: 0, reversed: false, manual: '' },
        queryResult: { columns: [], rows, row_count: rows.length },
      }),
      { rowFacetFields: [], colFacetFields: [] },
      'scatter',
    );

    expect(result.markFamily).toBe('point');
    expect(result.isValid).toBe(true);
    expect(result.exceedsLimit).toBeNull();
  });

  test('flags line charts with too many color series', () => {
    const colorField = discreteDimension('series');
    const rows = Array.from({ length: 400 }, (_, i) => ({
      t: i,
      'SUM(value)': i,
      series: `S${i}`,
    }));

    const result = validateRenderCost(
      context({
        xFields: [continuousDimension('t')],
        yFields: [measure('value')],
        color: { field: colorField, scheme: '', bias: 0, reversed: false, manual: '' },
        queryResult: { columns: [], rows, row_count: rows.length },
      }),
      { rowFacetFields: [], colFacetFields: [] },
      'line',
    );

    expect(result.markFamily).toBe('line');
    expect(result.seriesCount).toBe(400);
    expect(result.isValid).toBe(false);
    expect(result.exceedsLimit).toBe('series');
  });

  test('allows plain bar charts above the faceted category limit', () => {
    const categoryField = discreteDimension('category');
    const rows = Array.from({ length: 400 }, (_, i) => ({
      category: `C${i}`,
      'SUM(value)': i,
    }));

    const result = validateRenderCost(
      context({
        xFields: [categoryField],
        yFields: [measure('value')],
        queryResult: { columns: [], rows, row_count: rows.length },
      }),
      { rowFacetFields: [], colFacetFields: [] },
      'bar',
    );

    expect(result.markFamily).toBe('bar');
    expect(result.categoryCount).toBe(400);
    expect(result.categoryLimit).toBe(50000);
    expect(result.isValid).toBe(true);
    expect(result.exceedsLimit).toBeNull();
  });

  test('flags faceted bar charts with too many categories per cell', () => {
    const facetField = discreteDimension('facet');
    const categoryField = discreteDimension('category');
    const rows = Array.from({ length: 800 }, (_, i) => ({
      facet: `F${Math.floor(i / 400)}`,
      category: `C${i % 400}`,
      'SUM(value)': i,
    }));

    const result = validateRenderCost(
      context({
        xFields: [categoryField],
        yFields: [measure('value')],
        queryResult: { columns: [], rows, row_count: rows.length },
      }),
      { rowFacetFields: [facetField], colFacetFields: [] },
      'bar',
    );

    expect(result.markFamily).toBe('bar');
    expect(result.rowFacetCount).toBe(2);
    expect(result.categoryCount).toBe(400);
    expect(result.categoryLimit).toBe(300);
    expect(result.isValid).toBe(false);
    expect(result.exceedsLimit).toBe('category');
  });

  test('flags bar charts when facet and category product exceeds marks limit', () => {
    const facetField = discreteDimension('facet');
    const categoryField = discreteDimension('category');
    const rows = Array.from({ length: 50200 }, (_, i) => ({
      facet: `F${Math.floor(i / 200)}`,
      category: `C${i % 200}`,
      'SUM(value)': i,
    }));

    const result = validateRenderCost(
      context({
        xFields: [categoryField],
        yFields: [measure('value')],
        queryResult: { columns: [], rows, row_count: rows.length },
      }),
      { rowFacetFields: [facetField], colFacetFields: [] },
      'bar',
    );

    expect(result.markFamily).toBe('bar');
    expect(result.rowFacetCount).toBe(251);
    expect(result.categoryCount).toBe(200);
    expect(result.estimatedMarks).toBe(50200);
    expect(result.isValid).toBe(false);
    expect(result.exceedsLimit).toBe('marks');
  });

  test('preserves existing facet limit behavior', () => {
    const facetField = discreteDimension('facet');
    const rows = Array.from({ length: 501 }, (_, i) => ({ facet: `F${i}`, value: i }));

    const result = validateRenderCost(
      context({
        xFields: [facetField, measure('value')],
        queryResult: { columns: [], rows, row_count: rows.length },
      }),
      { rowFacetFields: [facetField], colFacetFields: [] },
      null,
    );

    expect(result.rowFacetCount).toBe(501);
    expect(result.isValid).toBe(false);
    expect(result.exceedsLimit).toBe('row');
  });
});
