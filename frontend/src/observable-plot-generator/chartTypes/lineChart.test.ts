import { buildLineOptions, LineBuildParams, harmonizeLineChartDomains } from './lineChart';

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

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

describe('buildLineOptions – dependent-axis domain always recomputed from data', () => {
  const makeParams = (data: any[], domain?: LineBuildParams['domain']): LineBuildParams => ({
    data,
    xColumn: 'x',
    yColumn: 'AVG(y)',
    orientation: 'horizontal',
    labels: { x: 'X', y: 'AVG(y)' },
    domain,
  });

  test('recomputes Y domain when bin-aggregation fires (horizontal)', () => {
    const data = generateRows(1999, 75, 25, [{ x: 9999, y: 10_000 }]);
    const rawDomain: LineBuildParams['domain'] = { y: [0, 10_500] };

    const opts = buildLineOptions(makeParams(data, rawDomain));
    const yDomain = (opts.y as any)?.domain as [number, number];

    expect(yDomain).toBeDefined();
    expect(yDomain).not.toEqual([0, 10_500]);
    expect(yDomain[0]).toBeLessThan(55);
    expect(yDomain[1]).toBeLessThanOrEqual(10_000 * 1.06);
  });

  test('recomputes Y domain even when no binning is needed', () => {
    // 500 rows (below the 1000 budget) – no binning, but domain is still
    // recomputed from the actual data values (Y ∈ [50, 100]).
    const data = generateRows(500, 75, 25);
    const inflatedDomain: LineBuildParams['domain'] = { y: [0, 400_000] };

    const opts = buildLineOptions(makeParams(data, inflatedDomain));
    const yDomain = (opts.y as any)?.domain as [number, number];

    // Should be much tighter than the caller-supplied [0, 400_000]
    expect(yDomain).toBeDefined();
    expect(yDomain[0]).toBeLessThan(55);
    expect(yDomain[1]).toBeLessThanOrEqual(110);
  });

  test('recomputes X domain for vertical orientation (dependent axis is X)', () => {
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
    expect(xDomain).not.toEqual([0, 10_500]);
    expect(xDomain[0]).toBeLessThan(55);
    // Y domain (independent axis for vertical) is not recomputed
    const yDomain = (opts.y as any)?.domain;
    expect(yDomain).toBeUndefined();
  });

  test('works when no caller domain is provided', () => {
    const data = generateRows(2000, 75, 25);

    const opts = buildLineOptions(makeParams(data, undefined));
    const yDomain = (opts.y as any)?.domain as [number, number];

    expect(yDomain).toBeDefined();
    expect(yDomain[0]).toBeGreaterThanOrEqual(40);
    expect(yDomain[1]).toBeLessThanOrEqual(120);
  });

  test('handles constant Y values after binning', () => {
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

  test('attaches __lineChartDomainInfo metadata', () => {
    const data = generateRows(500, 75, 25);
    const opts = buildLineOptions(makeParams(data, undefined));
    const info = (opts as any).__lineChartDomainInfo;

    expect(info).toBeDefined();
    expect(info.axis).toBe('y');
    expect(info.column).toBe('AVG(y)');
    expect(info.domain).toBeDefined();
    expect(info.domain[0]).toBeLessThan(55);
    expect(info.domain[1]).toBeLessThanOrEqual(110);
  });

  test('also recomputes for faceted charts (coordinator harmonizes later)', () => {
    // Even with facetFields, buildLineOptions recomputes from local data.
    // harmonizeLineChartDomains (called by the coordinator) merges per-cell
    // domains into a shared scale afterwards.
    const data = generateRows(500, 75, 25);
    const inflatedDomain: LineBuildParams['domain'] = { y: [0, 400_000] };

    const opts = buildLineOptions({
      ...makeParams(data, inflatedDomain),
      facetFields: [{ id: 'f1', columnName: 'category', type: 'dimension', flavour: 'discrete' } as any],
    });
    const yDomain = (opts.y as any)?.domain as [number, number];

    // Not the inflated domain — recomputed from actual data
    expect(yDomain).toBeDefined();
    expect(yDomain[1]).toBeLessThan(200);
  });
});

describe('harmonizeLineChartDomains', () => {
  function makeMockPlot(axis: 'x' | 'y', column: string, domain: [number, number]) {
    return {
      options: {
        [axis]: { label: column, domain },
        __lineChartDomainInfo: { axis, column, domain },
      } as any,
    };
  }

  test('merges Y domains across multiple facet plots', () => {
    const plots = [
      makeMockPlot('y', 'AVG(y)', [10, 100]),
      makeMockPlot('y', 'AVG(y)', [5, 200]),
      makeMockPlot('y', 'AVG(y)', [20, 150]),
    ];

    harmonizeLineChartDomains(plots);

    // All plots should share the widest domain
    for (const p of plots) {
      expect((p.options.y as any).domain).toEqual([5, 200]);
    }
  });

  test('merges X domains for vertical line charts', () => {
    const plots = [
      makeMockPlot('x', 'AVG(x)', [0, 50]),
      makeMockPlot('x', 'AVG(x)', [-10, 80]),
    ];

    harmonizeLineChartDomains(plots);

    for (const p of plots) {
      expect((p.options.x as any).domain).toEqual([-10, 80]);
    }
  });

  test('leaves single-plot groups unchanged', () => {
    const plots = [makeMockPlot('y', 'AVG(y)', [10, 100])];

    harmonizeLineChartDomains(plots);

    expect((plots[0].options.y as any).domain).toEqual([10, 100]);
  });

  test('ignores plots without __lineChartDomainInfo', () => {
    const linePlot = makeMockPlot('y', 'AVG(y)', [10, 100]);
    const scatterPlot = { options: { y: { label: 'Y', domain: [0, 500] } } as any };

    harmonizeLineChartDomains([linePlot, scatterPlot]);

    // Line plot keeps its own domain (only 1 in its group)
    expect((linePlot.options.y as any).domain).toEqual([10, 100]);
    // Scatter plot is untouched
    expect((scatterPlot.options.y as any).domain).toEqual([0, 500]);
  });

  test('handles separate groups for different columns', () => {
    const plots = [
      makeMockPlot('y', 'AVG(a)', [10, 100]),
      makeMockPlot('y', 'AVG(a)', [5, 200]),
      makeMockPlot('y', 'AVG(b)', [0, 50]),
      makeMockPlot('y', 'AVG(b)', [0, 30]),
    ];

    harmonizeLineChartDomains(plots);

    expect((plots[0].options.y as any).domain).toEqual([5, 200]);
    expect((plots[1].options.y as any).domain).toEqual([5, 200]);
    expect((plots[2].options.y as any).domain).toEqual([0, 50]);
    expect((plots[3].options.y as any).domain).toEqual([0, 50]);
  });
});

describe('buildLineOptions – pinned comparison metadata', () => {
  const discreteColorField = {
    id: 'series',
    columnName: 'series',
    type: 'dimension',
    flavour: 'discrete',
  } as any;

  test('builds facet-local plotted-dot comparison rows sorted by absolute value', () => {
    const opts = buildLineOptions({
      data: [
        { x: 1, 'AVG(y)': 10, series: 'Alpha' },
        { x: 1, 'AVG(y)': -30, series: 'Beta' },
        { x: 1, 'AVG(y)': 20, series: 'Gamma' },
        { x: 2, 'AVG(y)': 999, series: 'OtherX' },
      ],
      xColumn: 'x',
      yColumn: 'AVG(y)',
      orientation: 'horizontal',
      labels: { x: 'X', y: 'AVG(y)' },
      colorField: discreteColorField,
    });

    const tooltipConfig = (opts as any).__customTooltip;
    expect(tooltipConfig.getPinnedComparison).toBeDefined();

    const comparison = tooltipConfig.getPinnedComparison(tooltipConfig.data[0]);
    expect(comparison).toBeDefined();
    expect(comparison.comparisonBasis).toBe('plotted-dots');
    expect(comparison.items.map((item: any) => item.seriesLabel)).toEqual(['Beta', 'Gamma', 'Alpha']);

    const selectedItem = comparison.items.find((item: any) => item.isSelected);
    expect(selectedItem).toBeDefined();
    expect(selectedItem.seriesLabel).toBe('Alpha');

    const betaItem = comparison.items.find((item: any) => item.seriesLabel === 'Beta');
    expect(betaItem.colorHex).toBeDefined();
    expect(betaItem.percentDifference).toBeCloseTo(-400);
  });

  test('suppresses percentages when the selected plotted value is zero', () => {
    const opts = buildLineOptions({
      data: [
        { x: 1, 'AVG(y)': 0, series: 'Alpha' },
        { x: 1, 'AVG(y)': 15, series: 'Beta' },
      ],
      xColumn: 'x',
      yColumn: 'AVG(y)',
      orientation: 'horizontal',
      labels: { x: 'X', y: 'AVG(y)' },
      colorField: discreteColorField,
    });

    const tooltipConfig = (opts as any).__customTooltip;
    const comparison = tooltipConfig.getPinnedComparison(tooltipConfig.data[0]);

    expect(comparison.items).toHaveLength(2);
    expect(comparison.items.every((item: any) => item.percentDifference === undefined)).toBe(true);
  });

  test('does not expose comparison metadata when there is no peer series at the selected X', () => {
    const opts = buildLineOptions({
      data: [
        { x: 1, 'AVG(y)': 10, series: 'Alpha' },
        { x: 2, 'AVG(y)': 20, series: 'Beta' },
      ],
      xColumn: 'x',
      yColumn: 'AVG(y)',
      orientation: 'horizontal',
      labels: { x: 'X', y: 'AVG(y)' },
      colorField: discreteColorField,
    });

    const tooltipConfig = (opts as any).__customTooltip;
    expect(tooltipConfig.getPinnedComparison(tooltipConfig.data[0])).toBeUndefined();
  });
});
