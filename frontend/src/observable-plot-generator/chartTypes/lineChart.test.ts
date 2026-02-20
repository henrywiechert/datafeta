import { buildLineOptions, LineBuildParams } from './lineChart';

// Mock observable plot ESM for Jest
jest.mock('@observablehq/plot', () => ({
  line: (data: any[], opts: any) => ({ type: 'line', data, opts }),
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
}));

/**
 * Generate N rows with a numeric X and Y.
 * Y values cluster around `yCenter` with small jitter, plus optional outliers.
 */
function generateRows(
  n: number,
  yCenter: number,
  yJitter: number,
  outliers: { x: number; y: number }[] = []
): any[] {
  const rows: any[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      x: i,
      'AVG(y)': yCenter + (i % 2 === 0 ? yJitter : -yJitter),
    });
  }
  for (const o of outliers) {
    rows.push({ x: o.x, 'AVG(y)': o.y });
  }
  return rows;
}

describe('buildLineOptions – domain recomputation after bin-aggregation', () => {
  const makeParams = (data: any[], domain?: LineBuildParams['domain']): LineBuildParams => ({
    data,
    xColumn: 'x',
    yColumn: 'AVG(y)',
    orientation: 'horizontal',
    labels: { x: 'X', y: 'AVG(y)' },
    domain,
  });

  test('recomputes Y domain when bin-aggregation fires (horizontal)', () => {
    // 2000 rows with Y around 50–100, plus one extreme outlier at 10 000
    const data = generateRows(1999, 75, 25, [{ x: 9999, y: 10_000 }]);
    // Caller-supplied domain reflects the raw data range (including outlier)
    const rawDomain: LineBuildParams['domain'] = { y: [0, 10_500] };

    const opts = buildLineOptions(makeParams(data, rawDomain));
    const yDomain = (opts.y as any)?.domain as [number, number];

    // Should be recomputed from the bin-averaged data, NOT the raw [0, 10500]
    expect(yDomain).toBeDefined();
    // The recomputed domain should differ from the caller-supplied domain
    expect(yDomain).not.toEqual([0, 10_500]);
    // Lower bound should reflect actual data minimum (around 50 with padding)
    expect(yDomain[0]).toBeLessThan(55);
    // Upper bound should be based on actual binned max, not the raw 10500 ceiling
    // (the outlier bin still exists but the domain is data-derived, not caller-imposed)
    expect(yDomain[1]).toBeLessThanOrEqual(10_000 * 1.06); // max + padding
  });

  test('preserves caller domain when no binning is needed', () => {
    // 500 rows (below the 1000 budget) – no binning occurs
    const data = generateRows(500, 75, 25);
    const callerDomain: LineBuildParams['domain'] = { y: [0, 200] };

    const opts = buildLineOptions(makeParams(data, callerDomain));
    const yDomain = (opts.y as any)?.domain;

    // Domain should be the original caller-supplied domain
    expect(yDomain).toEqual([0, 200]);
  });

  test('recomputes X domain for vertical orientation (dependent axis is X)', () => {
    // 2000 rows; for vertical orientation the dependent axis is X
    const data: any[] = [];
    for (let i = 0; i < 1999; i++) {
      data.push({ x: 75 + (i % 2 === 0 ? 25 : -25), 'AVG(y)': i });
    }
    data.push({ x: 10_000, 'AVG(y)': 9999 });

    const rawDomain: LineBuildParams['domain'] = { x: [0, 10_500] };
    const opts = buildLineOptions({
      data,
      xColumn: 'x',
      yColumn: 'AVG(y)',
      orientation: 'vertical',
      labels: { x: 'X', y: 'Y' },
      domain: rawDomain,
    });

    const xDomain = (opts.x as any)?.domain as [number, number];
    expect(xDomain).toBeDefined();
    // The recomputed domain should differ from the caller-supplied [0, 10500]
    expect(xDomain).not.toEqual([0, 10_500]);
    // Lower bound should reflect actual binned data minimum (around 50)
    expect(xDomain[0]).toBeLessThan(55);
    // Y domain (independent axis for vertical) should be preserved from caller
    const yDomain = (opts.y as any)?.domain;
    // Y domain was not supplied, so Observable Plot auto-derives it (undefined)
    expect(yDomain).toBeUndefined();
  });

  test('works when no caller domain is provided', () => {
    // 2000 rows, no domain passed (undefined)
    const data = generateRows(2000, 75, 25);

    const opts = buildLineOptions(makeParams(data, undefined));
    const yDomain = (opts.y as any)?.domain as [number, number];

    // Should still recompute a domain for the bin-averaged data
    expect(yDomain).toBeDefined();
    expect(yDomain[0]).toBeGreaterThanOrEqual(40);
    expect(yDomain[1]).toBeLessThanOrEqual(120);
  });

  test('handles constant Y values after binning', () => {
    // All Y values identical → domain should have non-zero span
    const data: any[] = [];
    for (let i = 0; i < 2000; i++) {
      data.push({ x: i, 'AVG(y)': 42 });
    }

    const opts = buildLineOptions(makeParams(data, { y: [0, 100] }));
    const yDomain = (opts.y as any)?.domain as [number, number];

    expect(yDomain).toBeDefined();
    expect(yDomain[0]).toBeLessThan(42);
    expect(yDomain[1]).toBeGreaterThan(42);
  });
});
