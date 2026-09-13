// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Characterization tests for `generatePairChartOptions`.
 *
 * This is the single entry point the grid generator uses for every cell, and it
 * forwards ~20 optional settings into a `ChartContext`. These tests pin down
 * that forwarding (and the field-combination dispatch) so the signature can be
 * reshaped without silently re-mapping an argument.
 */
import { generatePairChartOptions } from './cellCharts';
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
    const opts = generatePairChartOptions([], null, null);
    expect(JSON.stringify(opts)).toContain('No fields');
  });

  test('a lone measure renders a bar', () => {
    const opts = generatePairChartOptions([{ 'SUM(v)': 5 }], measure('v'), null);
    expect(markTypes(opts).some((t) => t.startsWith('bar'))).toBe(true);
  });

  test('a lone dimension renders dots', () => {
    const opts = generatePairChartOptions([{ c: 'a' }], dimension('c'), null);
    expect(markTypes(opts)).toContain('dot');
  });

  test('dimension x measure renders a bar', () => {
    const data = [{ c: 'a', 'SUM(v)': 1 }, { c: 'b', 'SUM(v)': 2 }];
    const opts = generatePairChartOptions(data, dimension('c'), measure('v'));
    expect(markTypes(opts).some((t) => t.startsWith('bar'))).toBe(true);
  });

  test('measure x measure renders a scatter', () => {
    const data = [{ 'SUM(a)': 1, 'SUM(b)': 2 }, { 'SUM(a)': 3, 'SUM(b)': 4 }];
    const opts = generatePairChartOptions(data, measure('a'), measure('b'));
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

  /** Positional call mirroring coreGridGenerator's single call site. */
  const buildLine = (opts: {
    lineVariant?: any;
    areaFillOpacity?: number;
    lineColorMode?: any;
    lineSeriesLabels?: any;
    color?: any;
    xTickFormat?: (d: any) => string;
  }) =>
    generatePairChartOptions(
      lineData,                 // 1  data
      continuousDim,            // 2  xField
      measure('v'),             // 3  yField
      undefined,                // 4  sharedMeasureDomains
      { global: 'line' } as any,// 5  overrides
      opts.color,               // 6  color
      undefined,                // 7  sizeField
      undefined,                // 8  sizeRange
      undefined,                // 9  manualSize
      undefined,                // 10 sizeScaleData
      undefined,                // 11 bandThicknessScale
      undefined,                // 12 labelCfg
      undefined,                // 13 tooltipFields
      undefined,                // 14 facetFields
      undefined,                // 15 sharedCategoricalDomains
      undefined,                // 16 ganttZoomRange
      undefined,                // 17 shapeField
      undefined,                // 18 manualShape
      undefined,                // 19 distributionVariant
      opts.lineVariant,         // 20
      opts.areaFillOpacity,     // 21
      opts.lineColorMode,       // 22
      opts.lineSeriesLabels,    // 23
      opts.xTickFormat,         // 24
      undefined,                // 25 yTickFormat
    );

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

  // The line handler does not forward tick formats; bars do. Pinned via a bar
  // so the last two positional arguments stay covered.
  test('xTickFormat reaches the category axis of a bar', () => {
    const fmt = (d: any) => `#${d}`;
    const opts: any = generatePairChartOptions(
      [{ c: 'a', 'SUM(v)': 1 }],
      dimension('c'),
      measure('v'),
      undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined,
      fmt,        // 24 xTickFormat
      undefined,  // 25 yTickFormat
    );
    expect(opts.x?.tickFormat).toBe(fmt);
  });
});
