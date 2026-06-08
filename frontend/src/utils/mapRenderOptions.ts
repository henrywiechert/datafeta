// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { MapViewBounds } from '../types';
import { MapPlotOptionsMetadata } from '../observable-plot-generator/chartTypes/mapChart';
import { boundsToProjectionDomain } from './mapUtils';
import { computeProjectedAspectRatioForBounds } from './mapProjectionFit';

export type MapPlotOptions = Plot.PlotOptions & MapPlotOptionsMetadata;

/** Apply transient pan/zoom view to cached grid options (single-cell re-render path). */
export function applyMapViewToPlotOptions(
  options: MapPlotOptions,
  viewOverride?: MapViewBounds | null,
): MapPlotOptions {
  if (!viewOverride || !options.__mapHomeBounds) return options;
  return {
    ...options,
    projection: {
      ...(options.projection as object),
      type: (options.projection as { type?: string })?.type ?? 'equal-earth',
      domain: boundsToProjectionDomain(viewOverride),
    },
    __mapCurrentView: viewOverride,
    __mapAspectRatio: computeProjectedAspectRatioForBounds(viewOverride),
  };
}
