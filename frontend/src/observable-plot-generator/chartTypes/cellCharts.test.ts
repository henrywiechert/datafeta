// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Characterization tests for `generatePairChartOptions`.
 *
 * This is the single entry point the grid generator uses for every cell, and it
 * forwards ~20 optional settings into a `ChartContext`. These tests pin down
 * that forwarding and the field-combination dispatch.
 */
import { generatePairChartOptions } from './cellCharts';
import type { PairChartRequest } from './cellCharts';
import type { Field } from '../../types';

jest.mock('@observablehq/plot', () => {
  const mark = (type: string) => (data: any[], opts: any) => ({ type, data, opts });
  return {
    areaX: mark('areaX'),
    areaY: mark('areaY'),
    barX: mark('barX'),
    barY: mark('barY'),
    boxX: mark('boxX'),
    boxY: mark('boxY'),
    cell: mark('cell'),
    dot: mark('dot'),
    line: mark('line'),
    rectY: mark('rectY'),
    ruleX: mark('ruleX'),
    ruleY: mark('ruleY'),
    text: mark('text'),
    tickX: mark('tickX'),
    tickY: mark('tickY'),
    frame: mark('frame'),
  };
});

const dimension = (columnName: string, overrides: Partial<Field> = {}): Field => ({
  id: `dim-${columnName}`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
} as Field);

const measure = (columnName: string, overrides: Partial<Field> = {}): Field => ({
  id: `meas-${columnName}`,
  columnName,
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
  aggregation: 'sum',
  ...overrides,
} as Field);

const marksOf = (opts: any): any[] => (opts.marks || []) as any[];
const markTypes = (opts: any): string[] => marksOf(opts).map((m) => m?.type).filter(Boolean);

describe('generatePairChartOptions – field combination dispatch', () => {
  test('reports when no fields are supplied', () => {
    const opts = generatePairChartOptions({ data: [], xField: null, yField: null });
    expect(JSON.stringify(opts)).toContain('No fields');
  });

  test('a lone measure renders a bar', () => {
    const opts = generatePairChartOptions({
      data: [{ 'SUM(v)': 5 }],
      xField: measure('v'),
      yField: null,
    });
    expect(markTypes(opts).some((t) => t.startsWith('bar'))).toBe(true);
  });

  test('a lone dimension renders dots', () => {
    const opts = generatePairChartOptions({
      data: [{ c: 'a' }],
      xField: dimension('c'),
      yField: null,
    });
    expect(markTypes(opts)).toContain('dot');
  });

  test('dimension x measure renders a bar', () => {
    const opts = generatePairChartOptions({
      data: [{ c: 'a', 'SUM(v)': 1 }, { c: 'b', 'SUM(v)': 2 }],
      xField: dimension('c'),
      yField: measure('v'),
    });
    expect(markTypes(opts).some((t) => t.startsWith('bar'))).toBe(true);
  });

  test('measure x measure renders a scatter', () => {
    const opts = generatePairChartOptions({
      data: [{ 'SUM(a)': 1, 'SUM(b)': 2 }, { 'SUM(a)': 3, 'SUM(b)': 4 }],
      xField: measure('a'),
      yField: measure('b'),
    });
    expect(markTypes(opts)).toContain('dot');
  });
});

describe('generatePairChartOptions – settings reach the chart builders', () => {
  const continuousDim = dimension('t', { flavour: 'continuous', dataType: 'integer' });
  const lineData = [
    { t: 1, 'SUM(v)': 10, series: 'Alpha' },
    { t: 2, 'SUM(v)': 20, series: 'Alpha' },
    { t: 1, 'SUM(v)': 30, series: 'Beta' },
    { t: 2, 'SUM(v)': 40, series: 'Beta' },
  ];
  const colorField = dimension('series');
  const colorChannel = { field: colorField, scheme: '', bias: 0, reversed: false, manual: '' } as any;

  const buildLine = (settings: Partial<PairChartRequest>) =>
    generatePairChartOptions({
      data: lineData,
      xField: continuousDim,
      yField: measure('v'),
      overrides: { global: 'line' } as any,
      ...settings,
    });

  test('line variant selects line vs area marks', () => {
    expect(markTypes(buildLine({ lineVariant: 'line' }))).toContain('line');
    const area = markTypes(buildLine({ lineVariant: 'area' }));
    expect(area.some((t) => t.startsWith('area'))).toBe(true);
  });

  test('areaFillOpacity reaches the area mark', () => {
    const opts = buildLine({ lineVariant: 'area', areaFillOpacity: 0.71 });
    const areaMark = marksOf(opts).find((m) => m.type?.startsWith('area'));
    expect(areaMark.opts.fillOpacity).toBe(0.71);
  });

  test('lineSeriesLabels reaches the label mark', () => {
    expect(marksOf(buildLine({ color: colorChannel, lineSeriesLabels: 'off' }))
      .some((m) => m.type === 'text')).toBe(false);

    const labelled = marksOf(buildLine({ color: colorChannel, lineSeriesLabels: 'end' }))
      .find((m) => m.type === 'text');
    expect(labelled).toBeDefined();
    expect(labelled.opts.className).toContain('series-end-label');
  });

  // The line handler does not forward tick formats; bars do.
  test('xTickFormat reaches the category axis of a bar', () => {
    const fmt = (d: any) => `#${d}`;
    const opts: any = generatePairChartOptions({
      data: [{ c: 'a', 'SUM(v)': 1 }],
      xField: dimension('c'),
      yField: measure('v'),
      xTickFormat: fmt,
    });
    expect(opts.x?.tickFormat).toBe(fmt);
  });
});
