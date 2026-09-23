// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Hexbin Overlay Builder
 *
 * Aggregates scatter points into a hexagonal grid (Plot's hexbin transform,
 * which bins in pixel space, so hexagons tile evenly at any zoom). The point
 * count drives each hexagon's opacity — via the plot's `opacity` scale, so it
 * never competes with the chart's colour scale — and, per group, each hexagon
 * takes the colour of its dominant group from that colour scale.
 *
 * Meant for large scatters where individual dots overplot into a solid blob;
 * by default the dots are hidden (`hideSourceData`).
 */

import * as Plot from '@observablehq/plot';
import { OVERLAY_NO_HIGHLIGHT_CLASS, OverlayParams } from './types';
import { DEFAULT_MANUAL_COLOR } from '../../config/colorSchemes';

/**
 * Opacity scale for the counts. sqrt keeps single-point hexagons visible next
 * to dense ones, and the floor stops sparse bins from vanishing entirely.
 */
export const HEXBIN_OPACITY_SCALE = { type: 'sqrt', range: [0.15, 1] } as const;

const countTitle = {
  reduceIndex: (index: ArrayLike<number>) => `${index.length.toLocaleString()} point${index.length === 1 ? '' : 's'}`,
};

export function buildHexbin(
  data: any[],
  xCol: string,
  yCol: string,
  params: OverlayParams,
  _orientation: 'x' | 'y',
  colorColumn?: string,
): Plot.Markish {
  const groupColumn = params.perGroup && colorColumn ? colorColumn : undefined;

  const outputs: Record<string, any> = { fillOpacity: 'count', title: countTitle };
  const inputs: Record<string, any> = {
    x: xCol,
    y: yCol,
    binWidth: params.binWidth ?? 20,
    clip: true,
    // Hexagons are aggregates: their rows are bins, not the chart's rows, so
    // they can neither be stamped for highlighting nor carry a data tooltip.
    className: `overlay-no-tooltip ${OVERLAY_NO_HIGHLIGHT_CLASS}`,
  };

  if (groupColumn) {
    // Reduce the group channel to its most common value per hexagon rather
    // than binning each group separately, which would stack overlapping
    // hexagons of different colours on top of each other.
    outputs.fill = 'mode';
    inputs.fill = groupColumn;
  } else {
    inputs.fill = params.color ?? DEFAULT_MANUAL_COLOR;
  }

  return Plot.dot(data, Plot.hexbin(outputs as any, inputs as any));
}
