// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  applyChartViewport,
  cullRange,
  declareViewportAxis,
  getViewportAxes,
  sameChartViewport,
  toViewportNumber,
} from './chartViewport';
import { epochUnitToPreciseDate } from '../../datetime/datetimeDisplayFormat';

function plot(axis: 'x' | 'y', column: string, extent?: [number, number], temporal = false, domain?: any[]) {
  const options: any = { [axis]: { domainKey: column, domain } };
  declareViewportAxis(options, axis, { column, extent, temporal });
  return { options };
}

describe('applyChartViewport', () => {
  test('sets the viewport as domain of declared axes only', () => {
    const declared = plot('x', 'start', [0, 100], false, [0, 100]);
    const undeclared = { options: { x: { domainKey: 'start', domain: [0, 100] } } as any };

    applyChartViewport([declared, undeclared], { start: { min: 10, max: 20 } });

    expect((declared.options as any).x.domain).toEqual([10, 20]);
    expect((declared.options as any).x.nice).toBe(false);
    expect(undeclared.options.x.domain).toEqual([0, 100]);
  });

  test('emits Dates for temporal axes', () => {
    const p = plot('x', 'ts', [0, 1000], true);
    applyChartViewport([p], { ts: { min: 100, max: 200 } });
    expect((p.options as any).x.domain).toEqual([new Date(100), new Date(200)]);
  });

  test('unions extents across cells into bounds and clamps the viewport to them', () => {
    const a = plot('x', 'start', [0, 50]);
    const b = plot('x', 'start', [40, 100]);
    applyChartViewport([a, b], { start: { min: -20, max: 30 } });

    expect(getViewportAxes(a.options)?.x?.bounds).toEqual({ min: 0, max: 100 });
    expect(getViewportAxes(b.options)?.x?.bounds).toEqual({ min: 0, max: 100 });
    expect((a.options as any).x.domain).toEqual([0, 30]);
  });

  test('receivers (empty cells) adopt the viewport and the temporal flag of their column', () => {
    const contributor = plot('x', 'ts', [0, 1000], true);
    const receiver = plot('x', 'ts');
    applyChartViewport([receiver, contributor], { ts: { min: 100, max: 200 } });
    expect((receiver.options as any).x.domain).toEqual([new Date(100), new Date(200)]);
  });

  test('ignores a viewport that no longer overlaps the data', () => {
    const p = plot('x', 'start', [0, 100], false, [0, 100]);
    applyChartViewport([p], { start: { min: 500, max: 600 } });
    expect((p.options as any).x.domain).toEqual([0, 100]);
  });

  test('without a viewport only records bounds', () => {
    const p = plot('y', 'v', [5, 9], false, [5, 9]);
    applyChartViewport([p], {});
    expect((p.options as any).y.domain).toEqual([5, 9]);
    expect(getViewportAxes(p.options)?.y?.bounds).toEqual({ min: 5, max: 9 });
  });
});

describe('declareViewportAxis', () => {
  test('skips degenerate extents', () => {
    const options: any = {};
    declareViewportAxis(options, 'x', { column: 'c', extent: [5, 5] });
    expect(getViewportAxes(options)).toBeUndefined();
  });
});

describe('cullRange / sameChartViewport', () => {
  test('cullRange adds one span on each side', () => {
    expect(cullRange({ min: 10, max: 20 })).toEqual({ min: 0, max: 30 });
  });

  test('sameChartViewport compares by value', () => {
    expect(sameChartViewport({ a: { min: 1, max: 2 } }, { a: { min: 1, max: 2 } })).toBe(true);
    expect(sameChartViewport({ a: { min: 1, max: 2 } }, { a: { min: 1, max: 3 } })).toBe(false);
    expect(sameChartViewport({}, { a: { min: 1, max: 2 } })).toBe(false);
    expect(sameChartViewport({}, undefined)).toBe(true);
  });
});

describe('sub-millisecond temporal values', () => {
  const T = 1_700_000_000_123; // whole ms

  test('toViewportNumber keeps the microseconds of a PreciseDate', () => {
    const d = epochUnitToPreciseDate(T * 1000 + 400, 'us')!;
    expect(toViewportNumber(d)).toBeCloseTo(T + 0.4, 3);
  });

  test('a fractional viewport becomes a domain that keeps its fraction', () => {
    const p = plot('x', 'ts', [T - 10, T + 10], true);
    applyChartViewport([p], { ts: { min: T + 0.25, max: T + 1.25 } });
    const [lo, hi] = (p.options as any).x.domain as Date[];
    expect(lo).toBeInstanceOf(Date);
    expect(+lo).toBeCloseTo(T + 0.25, 3);
    expect(+hi).toBeCloseTo(T + 1.25, 3);
  });
});
