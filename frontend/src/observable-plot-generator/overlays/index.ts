/**
 * Overlay Orchestrator
 *
 * Pure function that post-processes PlotOptions by appending statistical
 * overlay marks.  Never mutates the input — returns a new PlotOptions with
 * the extra marks appended.
 *
 * Integration: call `applyOverlays()` in coreGridGenerator / facetGenerator
 * right after `generatePairChartOptions()` returns.
 */

import * as Plot from '@observablehq/plot';
import { UserChartType } from '../../types';
import { OverlayConfig, OverlayType, OverlayParams, OVERLAY_META } from './types';
import { buildLinearRegression } from './linearRegression';
import { buildMovingAverage } from './movingAverage';

// --- Builder registry -------------------------------------------------------

type OverlayBuilder = (
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  orientation: 'x' | 'y',
) => Plot.Markish;

const BUILDERS: Record<OverlayType, OverlayBuilder> = {
  linearRegression: buildLinearRegression,
  movingAverage: buildMovingAverage,
};

// Build applicability lookup from OVERLAY_META
const APPLICABILITY: Record<OverlayType, ReadonlySet<UserChartType>> =
  Object.fromEntries(OVERLAY_META.map(m => [m.type, m.applicableTo])) as any;

// --- Public API -------------------------------------------------------------

export interface OverlayMeta {
  data: any[];
  xColumn: string;
  yColumn: string;
  chartType: UserChartType;
  /** Which axis carries the dependent (value) variable */
  orientation: 'x' | 'y';
}

/**
 * Append active overlay marks to existing PlotOptions.
 * Returns the original object unchanged when no overlays apply.
 */
export function applyOverlays(
  options: Plot.PlotOptions,
  overlays: OverlayConfig[],
  meta: OverlayMeta,
): Plot.PlotOptions {
  const active = overlays.filter(o => o.enabled);
  if (active.length === 0) return options;

  const extraMarks: Plot.Markish[] = [];

  // Pre-sort data by the independent axis so the moving average
  // transform produces a smooth left-to-right line.
  const sortCol = meta.orientation === 'y' ? meta.xColumn : meta.yColumn;
  const sorted = [...meta.data].sort((a, b) => {
    const va = a[sortCol], vb = b[sortCol];
    if (va instanceof Date && vb instanceof Date) return va.getTime() - vb.getTime();
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
  });

  for (const overlay of active) {
    const applicable = APPLICABILITY[overlay.type];
    if (!applicable?.has(meta.chartType)) continue;

    const builder = BUILDERS[overlay.type];
    if (!builder) continue;

    extraMarks.push(
      builder(sorted, meta.xColumn, meta.yColumn, overlay.params, meta.orientation),
    );
  }

  if (extraMarks.length === 0) return options;

  return {
    ...options,
    marks: [...(options.marks || []), ...extraMarks],
  };
}
