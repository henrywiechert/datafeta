// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { geoEqualEarth, geoPath } from 'd3-geo';
import { MapViewBounds } from '../types';
import { boundsToProjectionDomain, MAP_EQUAL_EARTH_ASPECT_RATIO, panMapViewBounds } from './mapUtils';

/** Fit equal-earth projection to view bounds in a width×height frame (matches Plot default). */
export function fitMapProjectionToBounds(
  viewBounds: MapViewBounds,
  width: number,
  height: number,
) {
  const projection = geoEqualEarth();
  if (width <= 0 || height <= 0) return projection;
  projection.fitExtent([[0, 0], [width, height]], boundsToProjectionDomain(viewBounds));
  return projection;
}

/** Height÷width from equal-earth fit — matches Observable Plot cell layout. */
export function computeProjectedAspectRatioForBounds(bounds: MapViewBounds): number {
  const projection = geoEqualEarth();
  const domain = boundsToProjectionDomain(bounds);
  projection.fitWidth(100, domain);
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(domain);
  const width = Math.max(x1 - x0, 1e-6);
  const height = Math.max(y1 - y0, 1e-6);
  const ratio = height / width;
  if (!Number.isFinite(ratio) || ratio <= 0) return MAP_EQUAL_EARTH_ASPECT_RATIO;
  return Math.max(0.2, Math.min(5, ratio));
}

export function clientPointToPlotPixel(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): [number, number] {
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return [0, 0];
  const x = ((clientX - rect.left) / rect.width) * width;
  const y = ((clientY - rect.top) / rect.height) * height;
  return [x, y];
}

export function plotPixelToLonLat(
  viewBounds: MapViewBounds,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number] | null {
  const projection = fitMapProjectionToBounds(viewBounds, width, height);
  const lonLat = projection.invert?.([x, y]);
  if (!lonLat || !Number.isFinite(lonLat[0]) || !Number.isFinite(lonLat[1])) return null;
  return [lonLat[0], lonLat[1]];
}

/** Pan by screen-pixel drag delta; preserves geographic span (unlike SVG scale+translate commit). */
export function panMapViewBoundsFromPixelDelta(
  view: MapViewBounds,
  dx: number,
  dy: number,
  width: number,
  height: number,
  home: MapViewBounds,
): MapViewBounds {
  const projection = fitMapProjectionToBounds(view, width, height);
  const center = projection.invert?.([width / 2, height / 2]);
  const shifted = projection.invert?.([width / 2 - dx, height / 2 - dy]);
  if (!center || !shifted) return view;
  const dLon = shifted[0] - center[0];
  const dLat = shifted[1] - center[1];
  return panMapViewBounds(view, dLon, dLat, home);
}
