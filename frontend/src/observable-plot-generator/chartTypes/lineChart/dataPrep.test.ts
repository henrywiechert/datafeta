// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { prepareLineData } from './dataPrep';
import { epochUnitToPreciseDate } from '../../../datetime/datetimeDisplayFormat';
import type { ViewportRange } from '../../viewport/chartViewport';

/** Deterministic jagged series: neighbouring points differ a lot, so any re-binning shows. */
function makeRows(seriesCount: number, pointsPerSeries: number): any[] {
  const rows: any[] = [];
  for (let s = 0; s < seriesCount; s++) {
    for (let x = 0; x < pointsPerSeries; x++) {
      rows.push({ x, series: `S${s}`, y: Math.sin(x / 50) * 10 + ((x * 7919 + s * 104729) % 13) });
    }
  }
  return rows;
}

function prepare(rows: any[], viewport: ViewportRange | undefined, seriesColumns: string[] = ['series']) {
  return prepareLineData({
    data: rows,
    independentColumn: 'x',
    dependentColumn: 'y',
    seriesColumns,
    orientation: 'horizontal',
    viewport,
  });
}

/** Points of `rows` with x inside [min, max], as sorted "series|x|y" strings. */
function pointsWithin(rows: any[], min: number, max: number): string[] {
  return rows
    .filter((r) => r.x >= min && r.x <= max)
    .map((r) => `${r.series}|${r.x}|${r.y}`)
    .sort();
}

describe('prepareLineData with a viewport', () => {
  const rows = makeRows(4, 6000);
  const view: ViewportRange = { min: 2000, max: 3000 };
  // Small pans that are not a multiple of any bin width.
  const pans = [1, 7, 13.5, 250];

  test.each(pans)('panning by %p keeps the binned line points in the overlap unchanged', (delta) => {
    const before = prepare(rows, view);
    const after = prepare(rows, { min: view.min + delta, max: view.max + delta });
    expect(before.budgetedSorted.length).toBeLessThan(rows.length); // binning is active

    const overlap = [view.min + delta, view.max] as const;
    expect(pointsWithin(after.budgetedSorted, ...overlap)).toEqual(pointsWithin(before.budgetedSorted, ...overlap));
  });

  test.each(pans)('panning by %p keeps the sampled dots in the overlap unchanged', (delta) => {
    // Enough series that the dot budget forces thinning.
    const many = makeRows(12, 6000);
    const before = prepare(many, view);
    const after = prepare(many, { min: view.min + delta, max: view.max + delta });
    expect(before.dotData.length).toBeLessThan(before.budgetedSorted.length); // dot sampling is active

    const overlap = [view.min + delta, view.max] as const;
    expect(pointsWithin(after.dotData, ...overlap)).toEqual(pointsWithin(before.dotData, ...overlap));
  });

  test('single line: panning keeps the binned points in the overlap unchanged', () => {
    const single = makeRows(1, 20000);
    const before = prepare(single, view, []);
    const after = prepare(single, { min: view.min + 7, max: view.max + 7 }, []);
    expect(before.budgetedSorted.length).toBeLessThan(single.length);

    expect(pointsWithin(after.budgetedSorted, view.min + 7, view.max)).toEqual(
      pointsWithin(before.budgetedSorted, view.min + 7, view.max),
    );
  });

  test('a lone point in its bin keeps its own row (tooltip fields stay correct)', () => {
    const sparse = makeRows(1, 20000).map((r) => ({ ...r, note: `n${r.x}` }));
    // Zoomed in so far that every bin holds at most one point.
    const { budgetedSorted } = prepare(sparse, { min: 5000, max: 5100 }, []);
    const inside = budgetedSorted.filter((r) => r.x >= 5000 && r.x <= 5100);
    expect(inside.length).toBe(101);
    for (const r of inside) expect(r.note).toBe(`n${r.x}`);
  });

  test('stays within the point budget per series', () => {
    const { budgetedSorted, seriesGroups } = prepare(rows, view);
    for (const group of Array.from(seriesGroups!.values())) {
      expect(group.length).toBeLessThanOrEqual(1_000 + 2); // + one edge row on each side
    }
    expect(budgetedSorted.length).toBeGreaterThan(0);
  });
});

describe('prepareLineData with microsecond timestamps', () => {
  test('orders points within the same millisecond by their microseconds', () => {
    // Rows arrive with each same-millisecond pair reversed; a millisecond
    // comparison keeps that order and the line zig-zags back within the ms.
    const US = 1_700_000_000_123_000;
    const micros = [US + 700, US + 200, US + 1_800, US + 1_300];
    const data = micros.map((us, i) => ({ x: epochUnitToPreciseDate(us, 'us'), y: i }));

    const { budgetedSorted } = prepareLineData({
      data,
      independentColumn: 'x',
      dependentColumn: 'y',
      seriesColumns: [],
      orientation: 'horizontal',
    });

    expect(budgetedSorted.map((r) => r.y)).toEqual([1, 0, 3, 2]);
  });
});
