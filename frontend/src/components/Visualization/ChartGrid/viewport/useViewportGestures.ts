// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Mouse pan/zoom on one plot cell:
 * - Alt/Option + wheel zooms around the pointer; a horizontal wheel delta
 *   with the modifier pans x. Ctrl+wheel and trackpad pinch are left to the
 *   browser's page zoom, so the gesture never means two things depending on
 *   what has focus or sits under the pointer (e.g. a loading dialog).
 * - Plain left-button drag pans (after a small threshold, so clicks still
 *   pin tooltips and dismiss measurements).
 * - Double-click resets the cell's columns to their natural domain.
 *
 * Only axes the chart declared via `declareViewportAxis` are affected. All
 * updates go through the ViewportController (live value, committed on idle).
 */
import { useEffect, useRef, type RefObject } from 'react';
import type * as Plot from '@observablehq/plot';
import {
  getViewportAxes,
  type ViewportRange,
} from '../../../../observable-plot-generator/viewport/chartViewport';
import type { CellViewportAxis, ViewportController, ViewportPatch } from './viewportController';
import { minSpanFor, panBy, zoomAt } from './viewportMath';

/** Pointer travel before a plain drag becomes a pan (px). */
const PAN_THRESHOLD_PX = 5;
/** Zoom factor per wheel pixel: exp(deltaY * k). ~100px notch → ~1.22x. */
const WHEEL_ZOOM_SPEED = 0.002;
/** Elements (e.g. measurement grips) that own their own drag. */
export const NO_PAN_ATTRIBUTE = 'data-viewport-no-pan';

/**
 * Pan/zoom wheel gesture: Alt/Option + wheel only. Any Ctrl+wheel, including
 * a trackpad pinch (which browsers report as ctrl+wheel), stays browser page
 * zoom: a pinch can't be told apart from a Ctrl+mouse-wheel notch reliably,
 * since browsers scale wheel deltas by the page zoom and so make notches
 * fractional too.
 */
export function isViewportZoomWheel(e: WheelEvent): boolean {
  return e.altKey;
}

/** Pointerdown events re-dispatched after a click-without-drag; the pan handler must ignore them. */
const replayedEvents = new WeakSet<Event>();

export interface IndependentAxes {
  x?: boolean;
  y?: boolean;
}

/** Pannable axes of a cell; axes with independent per-facet domains are excluded. */
export function resolveCellViewportAxes(
  options: Plot.PlotOptions | undefined,
  independentDomains: IndependentAxes | undefined,
): CellViewportAxis[] {
  const axes = getViewportAxes(options);
  if (!axes) return [];
  const out: CellViewportAxis[] = [];
  for (const axis of ['x', 'y'] as const) {
    const info = axes[axis];
    if (!info?.bounds || independentDomains?.[axis]) continue;
    out.push({
      axis,
      column: info.column,
      bounds: info.bounds,
      temporal: !!info.temporal,
      natural: info.natural ?? info.bounds,
    });
  }
  return out;
}

/** Live viewport of the axis; without one the axis shows its natural domain. */
export function currentRange(controller: ViewportController, axis: CellViewportAxis): ViewportRange {
  return controller.get(axis.column) ?? axis.natural;
}

/**
 * Maps client coordinates onto an axis of the rendered plot, using the scale
 * range in SVG units and the SVG's on-screen size.
 */
export interface AxisFrame {
  /** Plot scale range [start, end] in SVG units (y runs bottom → top). */
  r0: number;
  r1: number;
  /** Client position → SVG units along this axis. */
  toSvg(clientX: number, clientY: number): number;
  /** Client distance → SVG units along this axis. */
  scale: number;
}

export function axisFrame(plotElement: Element | undefined, axis: 'x' | 'y'): AxisFrame | null {
  if (!plotElement) return null;
  const scaleDesc = (plotElement as any).scale?.(axis);
  const range = scaleDesc?.range;
  if (!Array.isArray(range) || range.length !== 2 || range[0] === range[1]) return null;
  const svg = plotElement instanceof SVGSVGElement ? plotElement : plotElement.querySelector('svg');
  if (!svg) return null;
  // Geometry must ignore the live preview's CSS transform on the svg
  // (useViewportPreview): getBoundingClientRect() of the svg itself would
  // return the transformed box. The svg sits at the top-left of its
  // (untransformed) host, and clientWidth/Height are layout sizes.
  const rect = (svg.parentElement ?? svg).getBoundingClientRect();
  const attr = Number(svg.getAttribute(axis === 'x' ? 'width' : 'height'));
  const size = (axis === 'x' ? svg.clientWidth : svg.clientHeight) || attr;
  const scale = size > 0 && attr > 0 ? attr / size : 1;
  return {
    r0: range[0],
    r1: range[1],
    scale,
    toSvg: (clientX, clientY) => (axis === 'x' ? clientX - rect.left : clientY - rect.top) * scale,
  };
}

function valueAt(frame: AxisFrame, svgPx: number, range: ViewportRange): number {
  const t = (svgPx - frame.r0) / (frame.r1 - frame.r0);
  return range.min + t * (range.max - range.min);
}

/** Data delta that keeps the content under the pointer while it moves by `svgDelta`. */
function panDelta(frame: AxisFrame, svgDelta: number, range: ViewportRange): number {
  return -(svgDelta / (frame.r1 - frame.r0)) * (range.max - range.min);
}

interface PanSession {
  pointerId: number;
  startX: number;
  startY: number;
  started: boolean;
  target: EventTarget | null;
  init: PointerEventInit;
  axes: Array<{ axis: CellViewportAxis; frame: AxisFrame; start: ViewportRange }>;
}

interface UseViewportGesturesArgs {
  wrapperRef: RefObject<HTMLElement>;
  options: Plot.PlotOptions | undefined;
  getPlotElement: () => Element | undefined;
  controller: ViewportController | undefined;
  independentDomains?: IndependentAxes;
}

export function useViewportGestures({
  wrapperRef,
  options,
  getPlotElement,
  controller,
  independentDomains,
}: UseViewportGesturesArgs): void {
  // Handlers read the latest props through a ref so listeners attach once.
  const latest = useRef({ options, getPlotElement, controller, independentDomains });
  latest.current = { options, getPlotElement, controller, independentDomains };

  const hasAxes = !!controller && resolveCellViewportAxes(options, independentDomains).length > 0;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !hasAxes) return;

    const resolveAxes = () => resolveCellViewportAxes(latest.current.options, latest.current.independentDomains);
    const target = { resolveAxes };

    const onWheel = (e: WheelEvent) => {
      if (!isViewportZoomWheel(e)) return;
      const ctrl = latest.current.controller;
      const plotElement = latest.current.getPlotElement();
      const axes = resolveAxes();
      if (!ctrl || !plotElement || axes.length === 0) return;
      // Claim the gesture: no browser page zoom, no grid scroll.
      e.preventDefault();
      e.stopPropagation();
      if (e.altKey) suppressNextAltKeyUp = true;

      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dy = e.deltaY * unit;
      const dx = e.deltaX * unit;
      const patch: ViewportPatch = {};
      for (const axis of axes) {
        const frame = axisFrame(plotElement, axis.axis);
        if (!frame) continue;
        let range: ViewportRange | null = currentRange(ctrl, axis);
        if (dy !== 0) {
          const anchor = valueAt(frame, frame.toSvg(e.clientX, e.clientY), range);
          range = zoomAt(range, anchor, Math.exp(dy * WHEEL_ZOOM_SPEED), axis.bounds, minSpanFor(axis.bounds, axis.temporal));
        }
        if (dx !== 0 && axis.axis === 'x') {
          const base = range ?? axis.bounds;
          range = panBy(base, -panDelta(frame, dx * frame.scale, base), axis.bounds);
        }
        patch[axis.column] = range;
      }
      if (Object.keys(patch).length > 0) ctrl.set(patch);
    };

    let session: PanSession | null = null;
    let restoreUserSelect: string | null = null;

    // Releasing Alt after Alt+wheel must not activate the browser menu bar
    // (Firefox on Windows/Linux toggles it on a bare Alt keyup).
    let suppressNextAltKeyUp = false;
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Alt' || !suppressNextAltKeyUp) return;
      suppressNextAltKeyUp = false;
      e.preventDefault();
    };

    const endSession = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      delete wrapper.dataset.panning;
      if (restoreUserSelect !== null) {
        document.body.style.userSelect = restoreUserSelect;
        restoreUserSelect = null;
      }
      session = null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const s = session;
      const ctrl = latest.current.controller;
      if (!s || e.pointerId !== s.pointerId || !ctrl) return;
      if (!s.started) {
        if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < PAN_THRESHOLD_PX) return;
        s.started = true;
        wrapper.dataset.panning = 'true';
        restoreUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
      }
      const patch: ViewportPatch = {};
      for (const { axis, frame, start } of s.axes) {
        const clientDelta = axis.axis === 'x' ? e.clientX - s.startX : e.clientY - s.startY;
        patch[axis.column] = panBy(start, panDelta(frame, clientDelta * frame.scale, start), axis.bounds);
      }
      ctrl.set(patch);
    };

    const onPointerUp = (e: PointerEvent) => {
      const s = session;
      if (!s || e.pointerId !== s.pointerId) return;
      endSession();
      if (s.started) {
        latest.current.controller?.flush();
        // The click that ends a pan must not pin a tooltip or dismiss a measurement.
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      } else if (s.target) {
        // A click without drag: hand the withheld pointerdown to the plot
        // (e.g. Plot's crosshair pointer toggles its sticky state on it).
        const replay = new PointerEvent('pointerdown', s.init);
        replayedEvents.add(replay);
        s.target.dispatchEvent(replay);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (replayedEvents.has(e)) return;
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return; // brush / measure gestures
      if ((e.target as Element | null)?.closest?.(`[${NO_PAN_ATTRIBUTE}]`)) return;
      const ctrl = latest.current.controller;
      const plotElement = latest.current.getPlotElement();
      if (!ctrl || !plotElement) return;
      const axes = resolveAxes()
        .map((axis) => ({ axis, frame: axisFrame(plotElement, axis.axis), start: currentRange(ctrl, axis) }))
        .filter((a): a is PanSession['axes'][number] => a.frame !== null);
      if (axes.length === 0) return;

      // Withhold the pointerdown from the plot until we know it's a click
      // (replayed on pointerup); otherwise a pan would also toggle Plot's
      // sticky crosshair. Click events are unaffected.
      e.stopPropagation();
      session = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        target: e.target,
        init: {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          isPrimary: e.isPrimary,
          button: e.button,
          buttons: e.buttons,
          clientX: e.clientX,
          clientY: e.clientY,
          screenX: e.screenX,
          screenY: e.screenY,
        },
        axes,
      };
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    };

    const onDoubleClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(`[${NO_PAN_ATTRIBUTE}]`)) return;
      const ctrl = latest.current.controller;
      const columns = resolveAxes().map((a) => a.column);
      if (!ctrl || columns.length === 0) return;
      ctrl.clear(columns);
    };

    const onPointerEnter = () => latest.current.controller?.setHoveredCell(target);
    const onPointerLeave = () => {
      const ctrl = latest.current.controller;
      if (ctrl?.getHoveredCell() === target) ctrl.setHoveredCell(null);
    };

    wrapper.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    wrapper.addEventListener('pointerdown', onPointerDown, { capture: true });
    wrapper.addEventListener('dblclick', onDoubleClick);
    wrapper.addEventListener('pointerenter', onPointerEnter);
    wrapper.addEventListener('pointerleave', onPointerLeave);
    // Mounted (or re-enabled) under a resting pointer: no pointerenter will fire.
    try {
      if (wrapper.matches(':hover')) onPointerEnter();
    } catch {
      // ':hover' unsupported (e.g. test DOM)
    }
    return () => {
      endSession();
      onPointerLeave();
      wrapper.removeEventListener('wheel', onWheel);
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      wrapper.removeEventListener('pointerdown', onPointerDown, { capture: true });
      wrapper.removeEventListener('dblclick', onDoubleClick);
      wrapper.removeEventListener('pointerenter', onPointerEnter);
      wrapper.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [wrapperRef, hasAxes]);
}
