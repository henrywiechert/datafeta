// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chart viewport: a transient, client-side view window over continuous axes,
 * keyed by the result column plotted on that axis. Pan/zoom gestures edit it;
 * chart generation applies it as the axis domain without re-querying.
 *
 * Contract with chart types:
 * - A chart that supports pan/zoom on an axis declares it via
 *   `declareViewportAxis`, passing the natural extent of its FULL (unculled)
 *   data. Charts may cull rows to `cullRange(viewport)` for detail and speed.
 * - `applyChartViewport` (run once per generated grid) unions the declared
 *   extents per column into `bounds`, then overrides the axis domain of every
 *   declared axis with the viewport range, clamped to those bounds.
 * - Gesture handlers read the declaration back from the cell options
 *   (`getViewportAxes`) to know which axes are pannable and how far.
 */
import type * as Plot from '@observablehq/plot';

export interface ViewportRange {
  min: number;
  max: number;
}

/** Viewport per result column; values are epoch ms for temporal axes. */
export type ChartViewport = Record<string, ViewportRange>;

export type ViewportAxis = 'x' | 'y';

export interface ViewportAxisInfo {
  /** Result column on this axis (same key as `options[axis].domainKey`). */
  column: string;
  /**
   * Natural extent of the chart's full data on this axis. Absent for a
   * receiver (an empty facet cell) that only adopts the shared viewport.
   */
  extent?: [number, number];
  /** Emit the domain as Dates (utc scale) instead of numbers. */
  temporal?: boolean;
  /** Union of the extents of all cells sharing this column; set by applyChartViewport. */
  bounds?: ViewportRange;
  /** The axis domain before the viewport was applied; set by applyChartViewport. */
  natural?: ViewportRange;
}

export type ViewportAxes = Partial<Record<ViewportAxis, ViewportAxisInfo>>;

const VIEWPORT_KEY = '__viewport';

export function declareViewportAxis(
  options: Plot.PlotOptions,
  axis: ViewportAxis,
  info: Omit<ViewportAxisInfo, 'bounds' | 'natural'>,
): void {
  if (info.extent) {
    const [a, b] = info.extent;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return;
  }
  const target = options as any;
  const axes: ViewportAxes = target[VIEWPORT_KEY] ?? (target[VIEWPORT_KEY] = {});
  axes[axis] = { ...info };
}

export function getViewportAxes(options: Plot.PlotOptions | undefined | null): ViewportAxes | undefined {
  return (options as any)?.[VIEWPORT_KEY];
}

/** Numeric value of a domain endpoint or data value (Dates → epoch ms). */
export function toViewportNumber(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return null;
}

/** Extent of a two-element numeric/Date domain, or null when not continuous. */
export function domainExtent(domain: unknown): [number, number] | null {
  if (!Array.isArray(domain) || domain.length !== 2) return null;
  const a = toViewportNumber(domain[0]);
  const b = toViewportNumber(domain[1]);
  if (a == null || b == null || b <= a) return null;
  return [a, b];
}

/**
 * Range of data a chart keeps when culling to a viewport: the viewport plus
 * `margin` spans on each side, so a pan preview has marks to show beyond the
 * edges. The margin trades preview coverage for DOM size.
 */
export function cullRange(range: ViewportRange, margin: number = 1): ViewportRange {
  const pad = (range.max - range.min) * margin;
  return { min: range.min - pad, max: range.max + pad };
}

/**
 * Apply the viewport to every declared axis of the generated plots.
 * Mutates the plot options in place (they are fresh per generation).
 */
export function applyChartViewport(
  plots: Array<{ options: Plot.PlotOptions }>,
  viewport: ChartViewport | null | undefined,
): void {
  const byColumn = new Map<string, { bounds: ViewportRange; temporal: boolean }>();
  for (const plot of plots) {
    const axes = getViewportAxes(plot.options);
    if (!axes) continue;
    for (const info of Object.values(axes)) {
      if (!info?.extent) continue;
      const [min, max] = info.extent;
      const prev = byColumn.get(info.column);
      byColumn.set(info.column, prev
        ? {
            bounds: { min: Math.min(prev.bounds.min, min), max: Math.max(prev.bounds.max, max) },
            temporal: prev.temporal || !!info.temporal,
          }
        : { bounds: { min, max }, temporal: !!info.temporal });
    }
  }

  for (const plot of plots) {
    const axes = getViewportAxes(plot.options);
    if (!axes) continue;
    for (const axis of ['x', 'y'] as const) {
      const info = axes[axis];
      const column = info && byColumn.get(info.column);
      if (!info || !column) continue;
      const { bounds, temporal } = column;
      info.bounds = bounds;
      info.temporal = temporal;
      const natural = domainExtent((plot.options as any)[axis]?.domain);
      info.natural = natural ? { min: natural[0], max: natural[1] } : bounds;

      const range = viewport?.[info.column];
      if (!range) continue;
      const min = Math.max(range.min, bounds.min);
      const max = Math.min(range.max, bounds.max);
      if (!(max > min)) continue;

      const options = plot.options as any;
      const scale = options[axis] ?? (options[axis] = {});
      scale.domain = temporal ? [new Date(min), new Date(max)] : [min, max];
      scale.nice = false;
    }
  }
}

/** Value equality of two viewports (entries compared by min/max). */
export function sameChartViewport(
  a: ChartViewport | null | undefined,
  b: ChartViewport | null | undefined,
): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a ?? {});
  const bKeys = Object.keys(b ?? {});
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => {
    const ra = a![k];
    const rb = b?.[k];
    return !!rb && ra.min === rb.min && ra.max === rb.max;
  });
}
