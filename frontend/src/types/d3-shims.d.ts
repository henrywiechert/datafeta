// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only

declare module 'd3-geo' {
  export interface GeoProjection {
    invert?: (point: [number, number]) => [number, number] | null;
    fitExtent(extent: [[number, number], [number, number]], object: unknown): GeoProjection;
  }
  export function geoEqualEarth(): GeoProjection;
}
