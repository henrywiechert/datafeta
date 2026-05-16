// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chart-type presentation strategy.
 *
 * Different chart types feed the rendering pipeline differently:
 *
 * - `'chart'`: standard Cartesian / faceted plot path. Most chart types (bar,
 *   line, scatter, tick, gantt, cdf, heatmap) live here.
 * - `'table'`: text/symbol grid path. Generated directly to a `GridResultModel`
 *   (no `PlotResult` intermediate) and rendered by `ChartGrid` with cell-kind
 *   dispatch. Pagination and the table-style header layout live here.
 * - `'pie'`: produced via the standard chart pipeline but emits `kind: 'pie'`
 *   cells which use `PieSvgRenderer` instead of Observable Plot.
 *
 * Centralising this keeps presentation-aware call sites (e.g. `ChartArea`,
 * `tableViewUtils`, `observablePlotGenerator`) from string-matching individual
 * chart-type ids. Adding a new chart type that uses the same presentation as
 * an existing one no longer requires touching every site — only this map.
 */
import { UserChartType } from '../../types';

export type ChartTypePresentation = 'chart' | 'table' | 'pie';

/**
 * Map a `UserChartType` (or null/undefined for "auto") to its presentation
 * strategy. Defaults to `'chart'` so unknown / future types render through the
 * standard pipeline.
 */
export function getChartTypePresentation(
  chartType: UserChartType | null | undefined,
): ChartTypePresentation {
  switch (chartType) {
    case 'table-refactor':
      return 'table';
    case 'pie':
      return 'pie';
    default:
      return 'chart';
  }
}

/** Convenience predicate for the table presentation path. */
export function isTablePresentation(
  chartType: UserChartType | null | undefined,
): boolean {
  return getChartTypePresentation(chartType) === 'table';
}
