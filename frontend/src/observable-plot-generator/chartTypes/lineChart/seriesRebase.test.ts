// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, FieldOverrideState } from '../../../types';
import { ChartGenerationContext } from '../../types';
import { generatePlot } from '../../observablePlotGenerator';
import { detectDefaultUserChartType } from '../../helpers/chartTypeResolver';
import { computeOverrideTargets } from '../../utils/fieldOverrides';
import { DEFAULT_OVERLAYS } from '../../overlays/types';
import {
  canRebaseLineSeries,
  rebaseLineCell,
  rebaseSeriesToFirstVisible,
  resolveRebasableLineCell,
} from './seriesRebase';

// Inert marks: every Plot function returns { type, data, opts }.
jest.mock('@observablehq/plot', () => {
  const transforms = new Set(['pointer', 'pointerX', 'pointerY', 'stackX', 'stackY', 'windowX', 'windowY']);
  return new Proxy({}, {
    get: (_target, name: string) => {
      if (name === '__esModule') return true;
      if (transforms.has(name)) {
        return (...args: any[]) => {
          const last = args[args.length - 1];
          return last && typeof last === 'object' ? last : {};
        };
      }
      return (data: any, opts: any) => ({ type: name, data, opts });
    },
  });
});

// Capture the rows an overlay is built from.
jest.mock('../../overlays/referenceLines', () => ({
  ...jest.requireActual('../../overlays/referenceLines'),
  buildReferenceLines: (rows: any[]) => ({ overlay: 'referenceLines', rows }),
}));

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

const region: Field = { id: 'region', columnName: 'region', type: 'dimension', flavour: 'discrete', dataType: 'string' };
const ts: Field = { id: 'ts', columnName: 'ts', type: 'dimension', flavour: 'continuous', dataType: 'integer' };
const tsDiscrete: Field = { ...ts, id: 'tsd', flavour: 'discrete' };
const value: Field = { id: 'value', columnName: 'value', type: 'measure', flavour: 'continuous', dataType: 'float', aggregation: 'sum' };
const other: Field = { id: 'other', columnName: 'other', type: 'measure', flavour: 'continuous', dataType: 'float', aggregation: 'sum' };

const V = 'SUM(value)';

// North: 50, 100, 75, 150 — South: 10, 20, 40, 30 (ts 1..4)
const rows = [
  { region: 'North', ts: 1, [V]: 50 },
  { region: 'South', ts: 1, [V]: 10 },
  { region: 'North', ts: 2, [V]: 100 },
  { region: 'South', ts: 2, [V]: 20 },
  { region: 'North', ts: 3, [V]: 75 },
  { region: 'South', ts: 3, [V]: 40 },
  { region: 'North', ts: 4, [V]: 150 },
  { region: 'South', ts: 4, [V]: 30 },
];

const valuesOf = (out: any[], series: string) =>
  out.filter((r) => r.region === series).sort((a, b) => a.ts - b.ts).map((r) => r[V]);

describe('rebaseSeriesToFirstVisible', () => {
  const base = { independentColumn: 'ts', dependentColumn: V, seriesColumns: ['region'] };

  it('indexes every series to its first value without a viewport', () => {
    const out = rebaseSeriesToFirstVisible(rows, base);
    expect(valuesOf(out, 'North')).toEqual([100, 200, 150, 300]);
    expect(valuesOf(out, 'South')).toEqual([100, 200, 400, 300]);
  });

  it('anchors at the first row at or after the viewport left edge', () => {
    const out = rebaseSeriesToFirstVisible(rows, { ...base, viewport: { min: 1.5, max: 4 } });
    // Rows left of the edge stay in the data, indexed to the same anchor.
    expect(valuesOf(out, 'North')).toEqual([50, 100, 75, 150]);
    expect(valuesOf(out, 'South')).toEqual([50, 100, 200, 150]);
  });

  it('anchors the anchor row at exactly 100', () => {
    const odd = [{ ts: 1, [V]: 0.1 + 0.2 }, { ts: 2, [V]: 0.7 }];
    const out = rebaseSeriesToFirstVisible(odd, { ...base, seriesColumns: [] });
    expect(out[0][V]).toBe(100);
  });

  it('treats all rows as one series without series columns', () => {
    const out = rebaseSeriesToFirstVisible(rows, { ...base, seriesColumns: [] });
    // First row (ts 1) is North's 50; ties at ts 1 keep the first seen.
    expect(out.map((r) => r[V])).toEqual([100, 20, 200, 40, 150, 80, 300, 60]);
  });

  it('anchors a series lying entirely left of the view at its last row', () => {
    const data = [
      { region: 'Old', ts: 1, [V]: 10 },
      { region: 'Old', ts: 2, [V]: 40 },
      { region: 'New', ts: 5, [V]: 8 },
    ];
    const out = rebaseSeriesToFirstVisible(data, { ...base, viewport: { min: 4, max: 6 } });
    expect(out.map((r) => r[V])).toEqual([25, 100, 100]);
  });

  it('drops series whose anchor is zero or negative', () => {
    const data = [
      { region: 'Zero', ts: 1, [V]: 0 },
      { region: 'Zero', ts: 2, [V]: 5 },
      { region: 'Neg', ts: 1, [V]: -2 },
      { region: 'Ok', ts: 1, [V]: 4 },
    ];
    const out = rebaseSeriesToFirstVisible(data, base);
    expect(out.map((r) => r[V])).toEqual([null, null, null, 100]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('handles Date values against an epoch-ms viewport', () => {
    const d = (day: number) => new Date(Date.UTC(2026, 0, day));
    const data = [
      { ts: d(1), [V]: 10 },
      { ts: d(2), [V]: 20 },
      { ts: d(3), [V]: 30 },
    ];
    const out = rebaseSeriesToFirstVisible(data, {
      ...base,
      seriesColumns: [],
      viewport: { min: d(2).getTime(), max: d(3).getTime() },
    });
    expect(out.map((r) => r[V])).toEqual([50, 100, 150]);
  });

  it('never mutates the input and passes non-numeric rows through', () => {
    const data = [{ ts: 1, [V]: 10 }, { ts: 2, [V]: null }, { ts: 3, [V]: 'n/a' }];
    const snapshot = JSON.parse(JSON.stringify(data));
    const out = rebaseSeriesToFirstVisible(data, { ...base, seriesColumns: [] });
    expect(data).toEqual(snapshot);
    expect(out[0]).not.toBe(data[0]);
    expect(out[1]).toBe(data[1]);
    expect(out[2]).toBe(data[2]);
  });
});

describe('resolveRebasableLineCell', () => {
  it('accepts a line along a continuous dimension in either orientation', () => {
    expect(resolveRebasableLineCell(ts, value, 'line')).toEqual({ dimensionField: ts, measureField: value });
    expect(resolveRebasableLineCell(value, ts, 'line')).toEqual({ dimensionField: ts, measureField: value });
  });

  it('rejects other chart types, discrete dimensions and measure pairs', () => {
    expect(resolveRebasableLineCell(ts, value, 'scatter')).toBeNull();
    expect(resolveRebasableLineCell(ts, value, 'barY')).toBeNull();
    expect(resolveRebasableLineCell(tsDiscrete, value, 'line')).toBeNull();
    expect(resolveRebasableLineCell(value, other, 'line')).toBeNull();
  });
});

describe('rebaseLineCell', () => {
  it('splits series by a discrete color and labels the measure as an index', () => {
    const result = rebaseLineCell({ data: rows, xField: ts, yField: value, cellChartType: 'line', colorField: region })!;
    expect(valuesOf(result.data, 'South')).toEqual([100, 200, 400, 300]);
    expect(result.xField).toBe(ts);
    expect(result.yField.displayAlias).toBe('value (index)');
    expect(result.yField.id).toBe(value.id);
  });

  it('relabels the measure on X for vertical lines', () => {
    const result = rebaseLineCell({ data: rows, xField: value, yField: ts, cellChartType: 'line' })!;
    expect(result.xField.displayAlias).toBe('value (index)');
    expect(result.yField).toBe(ts);
  });

  it('returns null for non-line cells', () => {
    expect(rebaseLineCell({ data: rows, xField: ts, yField: value, cellChartType: 'scatter' })).toBeNull();
  });
});

describe('canRebaseLineSeries', () => {
  const input = (x: Field[], y: Field[], extra: Partial<Parameters<typeof canRebaseLineSeries>[0]> = {}) => ({
    xFields: x,
    yFields: y,
    globalChartType: null,
    ...extra,
  });

  it('is available for an auto line chart, also when faceted', () => {
    expect(canRebaseLineSeries(input([ts], [value]))).toBe(true);
    expect(canRebaseLineSeries(input([region, ts], [value]))).toBe(true);
  });

  it('is unavailable without a line cell', () => {
    expect(canRebaseLineSeries(input([region], [value]))).toBe(false);
    expect(canRebaseLineSeries(input([value], [other]))).toBe(false);
    expect(canRebaseLineSeries(input([ts], [value], { globalChartType: 'bar' }))).toBe(false);
    expect(canRebaseLineSeries(input([ts], [value], { globalChartType: 'scatter' }))).toBe(false);
  });

  it('is available when one measure keeps a line next to a scatter override', () => {
    const fieldOverrides = { other: { chartType: 'scatter' } as FieldOverrideState };
    expect(canRebaseLineSeries(input([ts], [value, other], { fieldOverrides }))).toBe(true);
  });
});

describe('generatePlot with rebaseSeries', () => {
  function render(extra: Partial<ChartGenerationContext>) {
    const context: ChartGenerationContext = {
      xFields: [ts],
      yFields: [value],
      color: { field: region, scheme: 'tableau10', bias: 0, reversed: false, manual: '' },
      sizeRange: [4, 20],
      manualSize: 10,
      queryResult: { columns: [], rows, row_count: rows.length },
      fieldOverrideTargets: computeOverrideTargets([ts], [value], []),
      globalChartType: detectDefaultUserChartType([ts], [value], region) ?? null,
      overlays: DEFAULT_OVERLAYS.filter((o) => o.type === 'referenceLines').map((o) => ({ ...o, enabled: true })),
      ...extra,
    };
    const cell = generatePlot(context).cells.find((c) => c.content.kind === 'plot')!;
    const options = (cell.content as any).options;
    const marks = (options.marks ?? []) as any[];
    const lineRows = marks.find((m) => /^line/.test(m?.type) && Array.isArray(m.data))?.data as any[];
    const overlayRows = marks.find((m) => m?.overlay === 'referenceLines')?.rows as any[];
    return { options, lineRows, overlayRows };
  }

  it('leaves values untouched when off', () => {
    const { lineRows, options } = render({});
    expect(Math.max(...lineRows.map((r) => r[V]))).toBe(150);
    expect(options.y.label).toBe('value');
  });

  it('feeds the line, the dependent axis and overlays the same indexed rows', () => {
    const { lineRows, overlayRows, options } = render({ rebaseSeries: true });
    expect(valuesOf(lineRows, 'South')).toEqual([100, 200, 400, 300]);
    expect(Math.max(...overlayRows.map((r) => r[V]))).toBe(400);
    expect(options.y.domain[1]).toBeGreaterThanOrEqual(400);
    expect(options.y.domain[0]).toBeLessThanOrEqual(100);
    expect(options.y.label).toBe('value (index)');
  });

  it('re-anchors at the viewport left edge', () => {
    const { lineRows } = render({ rebaseSeries: true, chartViewport: { ts: { min: 1.5, max: 4 } } });
    expect(valuesOf(lineRows, 'South')).toEqual([50, 100, 200, 150]);
  });
});
