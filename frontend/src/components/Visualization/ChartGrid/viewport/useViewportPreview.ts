// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Live pan/zoom preview. A gesture updates the ViewportController on every
 * event, but the chart only regenerates once the gesture pauses. In between:
 * - each plot cell CSS-transforms its existing SVG (via its layer div, see
 *   previewLayer) from the domain it was rendered with to the live viewport (marks stretch briefly; cells cull
 *   with a margin so a pan reveals real marks, and clip along pannable axes,
 *   see PlotCell), and
 * - the axis gutters re-render their cheap axis-only plots with the live
 *   domain, so ticks stay correct.
 * The regenerated SVG then replaces the transformed one.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type * as Plot from '@observablehq/plot';
import {
  domainExtent,
  getViewportAxes,
  type ViewportRange,
} from '../../../../observable-plot-generator/viewport/chartViewport';
import type { ViewportController } from './viewportController';
import { axisFrame } from './useViewportGestures';
import { previewLayerOf } from './previewLayer';

/** Live domain for an axis of a plot's options, as Plot expects it (Dates on time axes). */
export function liveAxisDomain(
  options: Plot.PlotOptions | undefined,
  axis: 'x' | 'y',
  controller: ViewportController | undefined,
): any {
  const domain = (options as any)?.[axis]?.domain;
  const info = getViewportAxes(options)?.[axis];
  if (!info || !controller) return domain;
  const range = controller.get(info.column) ?? info.natural;
  if (!range) return domain;
  return info.temporal ? [new Date(range.min), new Date(range.max)] : [range.min, range.max];
}

/**
 * Live value → pixel mapping along an axis of a rendered cell (SVG units, as
 * Plot's scale range), following the pan/zoom viewport — including during a
 * gesture, before the chart regenerates. Null when the axis isn't continuous.
 */
export function liveAxisProjection(
  options: Plot.PlotOptions | undefined,
  axis: 'x' | 'y',
  controller: ViewportController | undefined,
  plotElement: Element | undefined,
): { project: (value: number) => number; rangeStart: number; rangeEnd: number } | null {
  const frame = axisFrame(plotElement, axis);
  if (!frame) return null;
  const info = getViewportAxes(options)?.[axis];
  const rendered = domainExtent((plotElement as any)?.scale?.(axis)?.domain);
  const range = (info && controller?.get(info.column))
    ?? info?.natural
    ?? (rendered ? { min: rendered[0], max: rendered[1] } : null);
  if (!range || !(range.max > range.min)) return null;
  const { r0, r1 } = frame;
  return {
    project: (value) => r0 + ((value - range.min) / (range.max - range.min)) * (r1 - r0),
    rangeStart: r0,
    rangeEnd: r1,
  };
}

/**
 * Axis gutters re-plot (Plot.plot + new DOM) on live updates; at every frame
 * that is a style/layout pass per gutter track, so they follow at ~20 fps.
 */
export const AXIS_LIVE_UPDATE_INTERVAL_MS = 50;

/**
 * Re-render on live viewport changes, at most once per animation frame and
 * at most every `minIntervalMs`. The last change always re-renders (the
 * render reads the live value then). Returns a counter that changes with
 * every update.
 */
export function useLiveViewportVersion(
  controller: ViewportController | undefined,
  minIntervalMs: number = 0,
): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!controller) return;
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    const update = () => {
      frame = requestAnimationFrame(() => {
        frame = null;
        last = performance.now();
        setVersion((v) => v + 1);
      });
    };
    const unsubscribe = controller.subscribe(() => {
      if (frame !== null || timer !== null) return;
      const wait = last + minIntervalMs - performance.now();
      if (wait <= 0) {
        update();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        update();
      }, wait);
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
    };
  }, [controller, minIntervalMs]);
  return version;
}

/**
 * CSS transform that maps the SVG rendered for `rendered` onto `live` along
 * one axis, in CSS pixels with origin at the SVG's top-left corner.
 */
export function axisPreviewTransform(
  c0: number,
  c1: number,
  rendered: ViewportRange,
  live: ViewportRange,
): { scale: number; translate: number } {
  const renderedSpan = rendered.max - rendered.min;
  const liveSpan = live.max - live.min;
  if (!(renderedSpan > 0) || !(liveSpan > 0)) return { scale: 1, translate: 0 };
  const scale = renderedSpan / liveSpan;
  const translate = c0 - c0 * scale + ((rendered.min - live.min) / liveSpan) * (c1 - c0);
  return { scale, translate };
}

/**
 * One preview pass of a cell, split so a frame can run all reads before any
 * write: `measure` only reads layout and returns the DOM write to perform.
 */
interface PreviewCell {
  measure(): (() => void) | null;
}

function runPreviewPass(cells: Iterable<PreviewCell>): void {
  const writes = Array.from(cells, (c) => c.measure());
  writes.forEach((write) => write?.());
}

/**
 * All preview cells of a controller update in ONE animation frame, reads
 * first, then writes. Per-cell frames interleave a layout read with the
 * previous cell's transform write, forcing a style + layout pass per cell.
 */
const previewRegistries = new WeakMap<
  ViewportController,
  { cells: Set<PreviewCell>; frame: number | null; unsubscribe: () => void }
>();

export function registerPreviewCell(controller: ViewportController, cell: PreviewCell): () => void {
  let registry = previewRegistries.get(controller);
  if (!registry) {
    const reg = { cells: new Set<PreviewCell>(), frame: null as number | null, unsubscribe: () => {} };
    reg.unsubscribe = controller.subscribe(() => {
      if (reg.frame !== null) return;
      reg.frame = requestAnimationFrame(() => {
        reg.frame = null;
        runPreviewPass(reg.cells);
      });
    });
    previewRegistries.set(controller, reg);
    registry = reg;
  }
  const reg = registry;
  reg.cells.add(cell);
  return () => {
    reg.cells.delete(cell);
    if (reg.cells.size > 0) return;
    reg.unsubscribe();
    if (reg.frame !== null) cancelAnimationFrame(reg.frame);
    previewRegistries.delete(controller);
  };
}

/**
 * Cells whose SVG was just replaced, re-measured together in the next frame.
 * Every plot of a grid redraws in one commit (a resize, a new query), each
 * swapping in its SVG and then asking for a refresh. Measuring on the spot
 * read layout right after the previous cell's DOM write, so a 270-facet grid
 * ran 270 style + layout passes, about two seconds, in one task. The frame
 * runs before paint, so the new SVG never shows without its transform.
 */
const pendingRefreshes = new Set<PreviewCell>();
let refreshFrame: number | null = null;

export function schedulePreviewRefresh(cell: PreviewCell): void {
  pendingRefreshes.add(cell);
  if (refreshFrame !== null) return;
  refreshFrame = requestAnimationFrame(() => {
    refreshFrame = null;
    const cells = Array.from(pendingRefreshes);
    pendingRefreshes.clear();
    runPreviewPass(cells);
  });
}

interface UseViewportPreviewArgs {
  wrapperRef: RefObject<HTMLElement>;
  options: Plot.PlotOptions | undefined;
  getPlotElement: () => Element | undefined;
  controller: ViewportController | undefined;
}

/** @returns `refresh`, to call when a new SVG has been rendered. */
export function useViewportPreview({
  wrapperRef,
  options,
  getPlotElement,
  controller,
}: UseViewportPreviewArgs): () => void {
  const latest = useRef({ options, getPlotElement, controller });
  latest.current = { options, getPlotElement, controller };

  const measure = useCallback((): (() => void) | null => {
    const { options: opts, getPlotElement: getEl, controller: ctrl } = latest.current;
    const wrapper = wrapperRef.current;
    const plotElement = getEl();
    const axes = getViewportAxes(opts);
    if (!wrapper || !plotElement || !axes || !ctrl) return null;
    const svg = plotElement instanceof SVGSVGElement ? plotElement : plotElement.querySelector('svg');
    if (!svg) return null;

    const t = { x: { scale: 1, translate: 0 }, y: { scale: 1, translate: 0 } };
    for (const axis of ['x', 'y'] as const) {
      const info = axes[axis];
      if (!info) continue;
      const live = ctrl.get(info.column) ?? info.natural;
      // The domain the CURRENT svg was drawn with (it may predate `opts`).
      const extent = domainExtent((plotElement as any).scale?.(axis)?.domain);
      const frame = axisFrame(plotElement, axis);
      if (!live || !extent || !frame) continue;
      t[axis] = axisPreviewTransform(
        frame.r0 / frame.scale,
        frame.r1 / frame.scale,
        { min: extent[0], max: extent[1] },
        live,
      );
    }

    const identity =
      Math.abs(t.x.scale - 1) < 1e-6 && Math.abs(t.y.scale - 1) < 1e-6 &&
      Math.abs(t.x.translate) < 0.5 && Math.abs(t.y.translate) < 0.5;
    const style = previewLayerOf(svg as SVGSVGElement).style;
    if (identity) {
      if (!style.transform) return null;
      return () => {
        style.transform = '';
        style.transformOrigin = '';
        style.willChange = '';
      };
    }
    const transform = `translate(${t.x.translate}px, ${t.y.translate}px) scale(${t.x.scale}, ${t.y.scale})`;
    return () => {
      // Own compositor layer while previewing: transform updates then skip
      // repainting every mark (thousands of circles per facet in a scatter).
      // This only holds for an HTML layer; see previewLayer.
      style.willChange = 'transform';
      style.transformOrigin = '0 0';
      style.transform = transform;
    };
  }, [wrapperRef]);

  // One object per cell, so a frame's refresh set holds each cell once.
  const cell = useMemo<PreviewCell>(() => ({ measure }), [measure]);

  const refresh = useCallback(() => {
    schedulePreviewRefresh(cell);
  }, [cell]);

  const hasAxes = !!controller && !!getViewportAxes(options);

  useEffect(() => {
    if (!controller || !hasAxes) return;
    return registerPreviewCell(controller, cell);
  }, [controller, hasAxes, cell]);

  return refresh;
}
