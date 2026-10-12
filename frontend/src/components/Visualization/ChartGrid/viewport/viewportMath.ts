// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Pure pan/zoom arithmetic on a 1D viewport range. Shared by the wheel, drag
 * and keyboard handlers so they clamp and limit identically.
 *
 * A result of `null` means "back to the natural view" (the range would cover
 * the bounds entirely), so callers clear the viewport entry instead of storing
 * a range equal to the bounds.
 */
import type { ViewportRange } from '../../../../observable-plot-generator/viewport/chartViewport';

/** Smallest span a viewport may zoom to: 1 ms on time axes, a millionth of the bounds otherwise. */
export function minSpanFor(bounds: ViewportRange, temporal: boolean): number {
  const boundsSpan = bounds.max - bounds.min;
  return temporal ? Math.max(1, boundsSpan * 1e-9) : boundsSpan * 1e-6;
}

/** Shift a range back inside the bounds without changing its span. */
export function clampToBounds(range: ViewportRange, bounds: ViewportRange): ViewportRange | null {
  const span = range.max - range.min;
  if (span >= bounds.max - bounds.min) return null;
  if (range.min < bounds.min) return { min: bounds.min, max: bounds.min + span };
  if (range.max > bounds.max) return { min: bounds.max - span, max: bounds.max };
  return range;
}

/**
 * Zoom by `factor` (< 1 zooms in) keeping `anchor` at the same relative position.
 */
export function zoomAt(
  range: ViewportRange,
  anchor: number,
  factor: number,
  bounds: ViewportRange,
  minSpan: number,
): ViewportRange | null {
  const span = range.max - range.min;
  if (!(span > 0) || !(factor > 0)) return range;
  const nextSpan = Math.max(minSpan, span * factor);
  if (nextSpan >= bounds.max - bounds.min) return null;
  const ratio = nextSpan / span;
  return clampToBounds(
    { min: anchor - (anchor - range.min) * ratio, max: anchor + (range.max - anchor) * ratio },
    bounds,
  );
}

/** Pan by `delta` data units. */
export function panBy(range: ViewportRange, delta: number, bounds: ViewportRange): ViewportRange | null {
  return clampToBounds({ min: range.min + delta, max: range.max + delta }, bounds);
}
