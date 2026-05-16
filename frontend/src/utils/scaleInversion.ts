// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Utilities to invert Observable Plot scale descriptors from pixel coordinates
 * back to data values. Used by the chart zoom brush.
 *
 * Observable Plot's `plot.scale("x")` returns a descriptor with `type`, `domain`,
 * `range`, etc. These functions use that descriptor to map pixel positions to data.
 */

export interface ScaleDescriptor {
  type?: string;
  domain?: any[];
  range?: number[];
  bandwidth?: number;
  step?: number;
  paddingInner?: number;
  paddingOuter?: number;
  align?: number;
  [key: string]: any;
}

/**
 * Coerce a domain endpoint to a plain number.
 * Handles Date objects (via getTime()) and other types (via Number()).
 */
function domainToNumber(val: any): number {
  if (val instanceof Date) return val.getTime();
  return Number(val);
}

/**
 * Invert a single pixel position to a data value on a quantitative
 * (linear, sqrt, log, etc.) scale. Falls back to linear interpolation.
 *
 * For temporal scales (utc / time) whose domain contains Date objects,
 * the return value is the epoch-millisecond timestamp.
 */
export function invertQuantitative(pixelPos: number, scale: ScaleDescriptor): number {
  const d0 = domainToNumber(scale.domain![0]);
  const d1 = domainToNumber(scale.domain![1]);
  const [r0, r1] = scale.range as [number, number];
  if (r1 === r0) return d0;

  const t = (pixelPos - r0) / (r1 - r0);

  if (scale.type === 'log') {
    const logD0 = Math.log(d0);
    const logD1 = Math.log(d1);
    return Math.exp(logD0 + t * (logD1 - logD0));
  }

  if (scale.type === 'sqrt') {
    const sqrtD0 = Math.sqrt(d0);
    const sqrtD1 = Math.sqrt(d1);
    const sqrtVal = sqrtD0 + t * (sqrtD1 - sqrtD0);
    return sqrtVal * sqrtVal;
  }

  // Linear / temporal (default)
  return d0 + t * (d1 - d0);
}

/**
 * Returns true if the scale descriptor represents a temporal (UTC / time) scale.
 */
export function isTemporalScale(scale: ScaleDescriptor): boolean {
  return scale.type === 'utc' || scale.type === 'time';
}

/**
 * Given a pixel range [startPx, endPx], return the subset of band scale domain
 * values whose bands overlap that range.
 *
 * Band layout: each band occupies `step` pixels. Within a step, the band itself
 * starts at `paddingInner/2 * step` and has width `bandwidth`.
 */
export function invertBand(startPx: number, endPx: number, scale: ScaleDescriptor): any[] {
  const domain = scale.domain as any[];
  const [r0, r1] = scale.range as [number, number];

  if (!domain || domain.length === 0) return [];

  const lo = Math.min(startPx, endPx);
  const hi = Math.max(startPx, endPx);

  // Use bandwidth and step from the descriptor if available;
  // otherwise estimate from range and domain length.
  const step = scale.step ?? (r1 - r0) / domain.length;
  const bandwidth = scale.bandwidth ?? step * 0.8;
  const paddingOuter = scale.paddingOuter ?? 0;
  const align = scale.align ?? 0.5;
  const rangeStart = r0 + paddingOuter * step * align;

  const result: any[] = [];
  for (let i = 0; i < domain.length; i++) {
    const bandStart = rangeStart + i * step;
    const bandEnd = bandStart + bandwidth;
    // Band overlaps the selection if it's not entirely before or after
    if (bandEnd > lo && bandStart < hi) {
      result.push(domain[i]);
    }
  }

  return result;
}

/**
 * Returns true if the scale descriptor represents a band/ordinal/point scale
 * (i.e. categories, not continuous numbers).
 */
export function isBandScale(scale: ScaleDescriptor): boolean {
  return scale.type === 'band' || scale.type === 'point' || scale.type === 'ordinal';
}
