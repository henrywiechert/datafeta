// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  getChartTypePresentation,
  isTablePresentation,
} from './chartTypePresentation';

describe('getChartTypePresentation (PR 10)', () => {
  test("returns 'table' for the table-refactor chart type", () => {
    expect(getChartTypePresentation('table-refactor')).toBe('table');
  });

  test("returns 'pie' for the pie chart type", () => {
    expect(getChartTypePresentation('pie')).toBe('pie');
  });

  test.each(['line', 'scatter', 'tick', 'bar', 'gantt', 'cdf', 'density', 'heatmap'] as const)(
    "returns 'chart' for %s",
    (type) => {
      expect(getChartTypePresentation(type)).toBe('chart');
    }
  );

  test("treats null/undefined (auto) as 'chart'", () => {
    expect(getChartTypePresentation(null)).toBe('chart');
    expect(getChartTypePresentation(undefined)).toBe('chart');
  });
});

describe('isTablePresentation (PR 10)', () => {
  test('is true only for table-presentation chart types', () => {
    expect(isTablePresentation('table-refactor')).toBe(true);

    expect(isTablePresentation('pie')).toBe(false);
    expect(isTablePresentation('bar')).toBe(false);
    expect(isTablePresentation('heatmap')).toBe(false);
    expect(isTablePresentation(null)).toBe(false);
    expect(isTablePresentation(undefined)).toBe(false);
  });
});
