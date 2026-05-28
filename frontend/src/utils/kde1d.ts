// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * One-dimensional Gaussian kernel density estimation for pairplot-style curves.
 * Observable Plot's Plot.density() uses 2D contour density; this module produces
 * a smooth (x, density) series suitable for line/area marks.
 */

export interface Kde1dPoint {
  x: number;
  y: number;
}

export interface Kde1dOptions {
  /** Smoothing multiplier applied to Scott's rule bandwidth (1 = default). */
  bandwidthMultiplier?: number;
  /** Number of evaluation points along the x-axis. */
  points?: number;
  /** Optional fixed x extent; defaults to data min/max with padding. */
  extent?: [number, number];
  /** Cap input samples for performance (stratified subsample when exceeded). */
  maxSamples?: number;
}

const DEFAULT_POINTS = 100;
const DEFAULT_MAX_SAMPLES = 10_000;

function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
}

function scottBandwidth(values: number[]): number {
  const n = values.length;
  if (n < 2) return 1;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const sigma = Math.sqrt(variance);
  if (!Number.isFinite(sigma) || sigma === 0) {
    const span = Math.max(...values) - Math.min(...values);
    return span > 0 ? span / 10 : 1;
  }
  return 1.06 * sigma * n ** -0.2;
}

function subsampleValues(values: number[], maxSamples: number): number[] {
  if (values.length <= maxSamples) return values;
  const step = values.length / maxSamples;
  const out: number[] = [];
  for (let i = 0; i < maxSamples; i++) {
    out.push(values[Math.floor(i * step)]);
  }
  return out;
}

/**
 * Compute a 1D KDE curve over numeric samples.
 */
export function computeKde1d(values: number[], options: Kde1dOptions = {}): Kde1dPoint[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [];

  const samples = subsampleValues(finite, options.maxSamples ?? DEFAULT_MAX_SAMPLES);
  const n = samples.length;
  const rawMin = options.extent?.[0] ?? Math.min(...samples);
  const rawMax = options.extent?.[1] ?? Math.max(...samples);
  const span = rawMax - rawMin;
  const pad = span > 0 ? span * 0.05 : 1;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const multiplier = options.bandwidthMultiplier ?? 1;
  const bandwidth = Math.max(scottBandwidth(samples) * multiplier, range / 1000);
  const numPoints = Math.max(20, options.points ?? DEFAULT_POINTS);

  const grid: Kde1dPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const x = min + (i / (numPoints - 1)) * range;
    let density = 0;
    for (const v of samples) {
      density += gaussianKernel((x - v) / bandwidth);
    }
    density /= n * bandwidth;
    grid.push({ x, y: density });
  }
  return grid;
}
