// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { DOMAIN_PAD_RATIO } from '../../../config/chartLayoutConfig';
import { formatDateTick } from '../../utils/dateFormatUtils';
import type { LineBuildParams } from './types';

/**
 * Recompute the dependent-axis domain from the (possibly bin-aggregated) data.
 * This ensures the Y-axis scale matches the actually-plotted values rather than
 * the pre-binning raw data, which can have a much wider range (especially with AVG).
 */
export function recomputeDependentDomain(
  rows: any[],
  dependentColumn: string,
  includeZero: boolean = false
): [number, number] | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const v = row[dependentColumn];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity || max === -Infinity) return undefined;
  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    // Avoid zero-span domain
    const pad = min === 0 ? 1 : Math.abs(min) * DOMAIN_PAD_RATIO;
    return [min - pad, max + pad];
  }
  const span = max - min;
  const pad = span * DOMAIN_PAD_RATIO;
  return [min - pad, max + pad];
}

export function buildLineAxes(params: {
  xColumn: string;
  yColumn: string;
  labels?: { x?: string; y?: string };
  effectiveDomain?: LineBuildParams['domain'];
  xIsTime: boolean;
  yIsTime: boolean;
}): Pick<Plot.PlotOptions, 'x' | 'y'> {
  const { xColumn, yColumn, labels, effectiveDomain, xIsTime, yIsTime } = params;

  return {
    x: {
      label: labels?.x || xColumn,
      domainKey: xColumn,
      grid: true,
      domain: effectiveDomain?.x,
      ...(xIsTime ? { type: 'utc' as any, tickFormat: formatDateTick } : {}),
    } as any,
    y: {
      label: labels?.y || yColumn,
      domainKey: yColumn,
      grid: true,
      domain: effectiveDomain?.y,
      ...(yIsTime ? { type: 'utc' as any, tickFormat: formatDateTick } : {}),
    } as any,
  };
}

export function attachLineDomainMetadata(params: {
  plotOptions: Plot.PlotOptions;
  axis: 'x' | 'y';
  column: string;
  domain?: [number, number];
}): void {
  const { plotOptions, axis, column, domain } = params;
  if (!domain) return;

  (plotOptions as any).__lineChartDomainInfo = {
    axis,
    column,
    domain,
  };
}

/**
 * Harmonize line chart dependent-axis domains across multiple plots so faceted
 * grids share the same scale. Collects per-cell recomputed domains (attached
 * by buildLineOptions as __lineChartDomainInfo) and replaces them with the
 * union across all cells grouped by axis + column.
 *
 * When an axis is configured as independent per facet, the union is scoped to a
 * single grid track instead of the whole grid: rows for an independent Y, columns
 * for an independent X. That matches the axis gutters, which render one Y axis per
 * grid row (YAxes) and one X axis per grid column (XAxes) sampled from the first
 * cell of that track - so every cell sharing a gutter must share its domain, but
 * cells in different tracks are free to differ.
 *
 * Note this is how line charts reach independent domains at all: buildLineOptions
 * deliberately discards the caller-supplied domain and recomputes it from the
 * post-binning data (see the comment there), so the per-row/per-column domains
 * from facetDomainContext never reach it. Partitioning here restores the intent
 * without giving up the anti-inflation recompute.
 *
 * Safe to call on mixed plot arrays - non-line-chart plots are ignored.
 */
export function harmonizeLineChartDomains(
  plots: Array<{ options: Plot.PlotOptions; position?: { row: number; col: number } }>,
  independentDomains?: { x?: boolean; y?: boolean }
): void {
  type Entry = { options: any; domain: [number, number] };
  const groups = new Map<string, Entry[]>();

  for (const plot of plots) {
    const info = (plot.options as any)?.__lineChartDomainInfo;
    if (!info?.domain) continue;
    const key = `${info.axis}:${info.column}:${facetTrackKey(info.axis, plot.position, independentDomains)}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push({ options: plot.options, domain: info.domain });
  }

  groups.forEach((group) => {
    if (group.length <= 1) return;

    const sharedMin = Math.min(...group.map((g: Entry) => g.domain[0]));
    const sharedMax = Math.max(...group.map((g: Entry) => g.domain[1]));
    const shared: [number, number] = [sharedMin, sharedMax];

    for (const { options } of group) {
      const info = options.__lineChartDomainInfo;
      if (options[info.axis]) {
        options[info.axis].domain = shared;
      }
      info.domain = shared;
    }
  });
}

/**
 * Grouping suffix that confines harmonization to one grid track when the plotted
 * axis is independent per facet. Returns a constant (grid-wide group) when the
 * axis is shared, or when the caller supplied no position to partition by.
 */
function facetTrackKey(
  axis: 'x' | 'y',
  position?: { row: number; col: number },
  independentDomains?: { x?: boolean; y?: boolean }
): string {
  if (!position || !independentDomains?.[axis]) return 'all';
  // One Y axis per grid row, one X axis per grid column.
  return axis === 'y' ? `r${position.row}` : `c${position.col}`;
}
