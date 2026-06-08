// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, MultiPoint } from 'geojson';
import type { Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import { Field } from '../types';

const LON_NAME = /\b(long|lon|lng|longitude)\b/i;
const LAT_NAME = /\b(lat|latitude)\b/i;

const MIN_PAD_DEG = 1;
const PAD_RATIO = 0.1;

let cachedWorldCountries: FeatureCollection | null = null;

export function isNumericGeoField(field: Field): boolean {
  return field.dataType === 'integer' || field.dataType === 'float';
}

/** Innermost continuous dimension on each shelf (Tableau-style). */
export function pickMapAxisFields(
  xFields: Field[],
  yFields: Field[],
): { lonField: Field; latField: Field } | null {
  const lonField = [...xFields]
    .reverse()
    .find((f) => f.type === 'dimension' && f.flavour === 'continuous' && isNumericGeoField(f));
  const latField = [...yFields]
    .reverse()
    .find((f) => f.type === 'dimension' && f.flavour === 'continuous' && isNumericGeoField(f));
  if (!lonField || !latField) return null;
  return { lonField, latField };
}

export function isMapAllowed(xFields: Field[], yFields: Field[]): boolean {
  const picked = pickMapAxisFields(xFields, yFields);
  if (!picked) return false;
  const xHasMeasure = xFields.some((f) => f.type === 'measure');
  const yHasMeasure = yFields.some((f) => f.type === 'measure');
  return !(xHasMeasure && yHasMeasure);
}

export function looksLikeLongitudeField(field: Field): boolean {
  const names = [field.columnName, field.displayAlias || ''].join(' ');
  return LON_NAME.test(names);
}

export function looksLikeLatitudeField(field: Field): boolean {
  const names = [field.columnName, field.displayAlias || ''].join(' ');
  return LAT_NAME.test(names);
}

export function shouldWarnGeoScatter(
  globalChartType: string | null | undefined,
  xFields: Field[],
  yFields: Field[],
): boolean {
  if (globalChartType === 'map') return false;
  const picked = pickMapAxisFields(xFields, yFields);
  if (!picked) return false;
  return looksLikeLongitudeField(picked.lonField) && looksLikeLatitudeField(picked.latField);
}

export function isValidGeoCoordinate(lon: number, lat: number): boolean {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

export function filterValidGeoRows(rows: any[], lonColumn: string, latColumn: string): any[] {
  return rows.filter((row) => {
    const lon = Number(row?.[lonColumn]);
    const lat = Number(row?.[latColumn]);
    return isValidGeoCoordinate(lon, lat);
  });
}

/** Returns [lonMin, latMin, lonMax, latMax] with padding, or null when no valid points. */
export function computeGeoBounds(
  rows: any[],
  lonColumn: string,
  latColumn: string,
): [number, number, number, number] | null {
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let latMin = Infinity;
  let latMax = -Infinity;
  let count = 0;

  for (const row of rows) {
    const lon = Number(row?.[lonColumn]);
    const lat = Number(row?.[latColumn]);
    if (!isValidGeoCoordinate(lon, lat)) continue;
    count += 1;
    lonMin = Math.min(lonMin, lon);
    lonMax = Math.max(lonMax, lon);
    latMin = Math.min(latMin, lat);
    latMax = Math.max(latMax, lat);
  }

  if (count === 0) return null;

  let lonSpan = lonMax - lonMin;
  let latSpan = latMax - latMin;
  if (lonSpan === 0) {
    lonMin -= MIN_PAD_DEG;
    lonMax += MIN_PAD_DEG;
    lonSpan = MIN_PAD_DEG * 2;
  }
  if (latSpan === 0) {
    latMin -= MIN_PAD_DEG;
    latMax += MIN_PAD_DEG;
    latSpan = MIN_PAD_DEG * 2;
  }

  const lonPad = Math.max(lonSpan * PAD_RATIO, MIN_PAD_DEG);
  const latPad = Math.max(latSpan * PAD_RATIO, MIN_PAD_DEG);

  return [
    Math.max(-180, lonMin - lonPad),
    Math.max(-90, latMin - latPad),
    Math.min(180, lonMax + lonPad),
    Math.min(90, latMax + latPad),
  ];
}

/**
 * Build a projection `domain` for Observable Plot.
 *
 * Use MultiPoint (bbox corners), not a Polygon ring: on equal-earth,
 * geoPath().bounds(polygon) spans the full frame so Plot's domain fit
 * never zooms in.
 */
export function boundsToProjectionDomain(
  bounds: [number, number, number, number],
): Feature<MultiPoint> {
  const [lonMin, latMin, lonMax, latMax] = bounds;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPoint',
      coordinates: [
        [lonMin, latMin],
        [lonMax, latMin],
        [lonMax, latMax],
        [lonMin, latMax],
      ],
    },
  };
}

/** Height÷width for the data bounds (approximate; used for chart cell layout). */
export function computeMapAspectRatioForBounds(
  bounds: [number, number, number, number],
): number {
  const [lonMin, latMin, lonMax, latMax] = bounds;
  const latMid = (latMin + latMax) / 2;
  const lonSpan = Math.max(lonMax - lonMin, 1e-6);
  const latSpan = Math.max(latMax - latMin, 1e-6);
  const cosLat = Math.cos((latMid * Math.PI) / 180);
  const ratio = latSpan / (lonSpan * Math.max(cosLat, 0.1));
  if (!Number.isFinite(ratio) || ratio <= 0) return MAP_EQUAL_EARTH_ASPECT_RATIO;
  return Math.max(0.2, Math.min(5, ratio));
}

export function getWorldCountries(): FeatureCollection {
  if (!cachedWorldCountries) {
    const topology = countries110m as unknown as Topology;
    cachedWorldCountries = feature(topology, topology.objects.countries) as FeatureCollection;
  }
  return cachedWorldCountries;
}

export const MAP_ATTRIBUTION = 'Map outlines © Natural Earth';

/**
 * Natural height÷width of the equal-earth projection (Observable Plot constants).
 * Used so map cells keep world-map proportions while filling the chart area.
 */
export const MAP_EQUAL_EARTH_ASPECT_RATIO = 2.6347 / 5.4133;

/** Observable Plot projection domain for the full globe. */
export function getWorldProjectionDomain(): { type: 'Sphere' } {
  return { type: 'Sphere' };
}

export function resolveMapProjectionDomain(
  bounds: [number, number, number, number],
  extentMode: import('../types').MapExtentMode,
): Feature<MultiPoint> | { type: 'Sphere' } {
  if (extentMode === 'world') return getWorldProjectionDomain();
  return boundsToProjectionDomain(bounds);
}

export function resolveMapAspectRatio(
  bounds: [number, number, number, number],
  extentMode: import('../types').MapExtentMode,
): number {
  if (extentMode === 'world') return MAP_EQUAL_EARTH_ASPECT_RATIO;
  return computeMapAspectRatioForBounds(bounds);
}

/** Fit a map plot inside a container while preserving geographic aspect ratio. */
export function fitMapDimensions(
  containerWidth: number,
  containerHeight: number,
  aspectRatio: number = MAP_EQUAL_EARTH_ASPECT_RATIO,
): { width: number; height: number } {
  if (containerWidth <= 0 || containerHeight <= 0 || aspectRatio <= 0) {
    return { width: 0, height: 0 };
  }

  const mapWidthOverHeight = 1 / aspectRatio;
  const containerAspect = containerWidth / containerHeight;

  if (containerAspect > mapWidthOverHeight) {
    const height = containerHeight;
    return { width: Math.round(height * mapWidthOverHeight), height };
  }

  const width = containerWidth;
  return { width, height: Math.round(width * aspectRatio) };
}
