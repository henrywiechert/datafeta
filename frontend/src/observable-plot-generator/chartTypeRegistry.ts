// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chart-type metadata registry.
 *
 * Single source of truth for the cross-cutting metadata of the grid-level chart
 * types (cdf, density, pie, heatmap, table-refactor): whether a given axis
 * configuration is allowed, which query grain they force, and whether switching
 * to/from them must re-run the query.
 *
 * This module is intentionally metadata-only: it holds no references to chart
 * generator functions or React components, so it can be imported safely from
 * the query-planning layer (`buildViewSpec`), the reducer layer
 * (`overridesReducer`), and the rendering layer (`observablePlotGenerator`)
 * without creating cross-layer or circular dependencies.
 *
 * Presentation strategy (chart vs table vs pie) is owned by
 * `chartTypes/chartTypePresentation.ts`; per-chart-type default mark sizes are
 * owned by `config/chartLayoutConfig.ts`. This registry does not duplicate them.
 */
import { Field, UserChartType } from '../types';
import { isCdfAllowed } from '../utils/cdfUtils';
import { isDensityAllowed } from '../utils/densityUtils';
import type { ViewGrain } from '../viewPlanner/types';

export interface ChartTypeDescriptor {
  id: UserChartType;
  /** Whether this chart type can render for the given axis configuration. */
  isAllowed: (xFields: Field[], yFields: Field[], colorField?: Field | null) => boolean;
  /**
   * Query grain forced when this chart type is active and allowed. Undefined
   * means "use the default grain derivation".
   */
  grain?: ViewGrain;
  /** When true, switching into or out of this type must re-run the query. */
  bumpsQueryVersion?: boolean;
  /**
   * Grid-level chart type: bypasses the per-pair cell pipeline and is produced
   * by a dedicated grid generator in `observablePlotGenerator`.
   */
  isGridChart?: boolean;
  /**
   * When the type is selected but `isAllowed` returns false, clear
   * `globalChartType` so the standard auto-detect pipeline renders instead.
   */
  clearWhenNotAllowed?: boolean;
}

function hasMeasure(fields: Field[]): boolean {
  return fields.some((f) => f.type === 'measure');
}

export const CHART_TYPE_REGISTRY: Partial<Record<UserChartType, ChartTypeDescriptor>> = {
  cdf: {
    id: 'cdf',
    isAllowed: (xFields, yFields) => isCdfAllowed(xFields, yFields),
    grain: 'cdf',
    bumpsQueryVersion: true,
    isGridChart: true,
  },
  density: {
    id: 'density',
    isAllowed: (xFields, yFields) => isDensityAllowed(xFields, yFields),
    grain: 'rawRows',
    bumpsQueryVersion: true,
    isGridChart: true,
  },
  pie: {
    id: 'pie',
    // Pie needs a single value axis; if both axes carry a measure it cannot
    // render and the standard pipeline takes over.
    isAllowed: (xFields, yFields) => !(hasMeasure(xFields) && hasMeasure(yFields)),
    bumpsQueryVersion: true,
    isGridChart: true,
    clearWhenNotAllowed: true,
  },
  heatmap: {
    id: 'heatmap',
    isAllowed: () => true,
    isGridChart: true,
  },
  map: {
    id: 'map',
    // Always dispatch to the map generator (like heatmap); invalid shelf
    // configurations show an in-chart message instead of falling back to scatter.
    isAllowed: () => true,
    grain: 'rawRows',
    isGridChart: true,
  },
  'table-refactor': {
    id: 'table-refactor',
    isAllowed: () => true,
    isGridChart: true,
  },
};

/** Look up a chart-type descriptor, tolerating null/undefined ("auto"). */
export function getChartTypeDescriptor(
  chartType: UserChartType | null | undefined,
): ChartTypeDescriptor | undefined {
  return chartType ? CHART_TYPE_REGISTRY[chartType] : undefined;
}

/**
 * Grid-level PlotResult chart types in dispatch priority order. Excludes
 * `table-refactor`, which emits a GridResultModel via a separate path.
 */
export const GRID_PLOT_CHART_TYPE_ORDER: UserChartType[] = ['cdf', 'density', 'pie', 'heatmap', 'map'];
