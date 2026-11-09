// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Crosshair synchronisation across the cells of a chart grid.
 *
 * Every grid cell is its own Plot, and Plot's `pointer` transform only knows
 * about the SVG it lives in. The cell under the pointer therefore draws the
 * full crosshair (see `overlays/crosshair.ts`); the other cells mirror it here
 * with plain guide lines at the same data-space position. A line is mirrored
 * only into cells plotting the same column on that axis, so it lands on the
 * same value in every facet and is skipped in cells where it would be
 * meaningless (e.g. the other measure of a cartesian grid).
 */

import { createContext } from 'react';
import { T } from '../../theme/tokens';
import { bypassViewportPan } from './ChartGrid/viewport/useViewportGestures';
import type { CrosshairSpec } from '../../observable-plot-generator/overlays/types';

export interface CrosshairPoint {
  spec: CrosshairSpec;
  x: unknown;
  y: unknown;
}

type Listener = (source: object, point: CrosshairPoint | null) => void;

/** Shared by all cells of one grid; `null` outside a grid (no syncing). */
export class CrosshairSyncStore {
  private listeners = new Set<Listener>();
  private releasers = new Map<object, () => void>();
  private activeSource: object | null = null;

  publish(source: object, point: CrosshairPoint | null): void {
    // A cell losing the pointer must not wipe the crosshair of the cell that
    // already took over (leave and enter arrive in either order).
    if (point == null && this.activeSource !== source) return;
    this.activeSource = point == null ? null : source;
    this.listeners.forEach((l) => l(source, point));
  }

  /** Register how a cell un-pins its own crosshair; returns the unregister function. */
  registerRelease(source: object, release: () => void): () => void {
    this.releasers.set(source, release);
    return () => { this.releasers.delete(source); };
  }

  /** Un-pin the crosshair in every cell except `source`. */
  releaseOthers(source: object): void {
    this.releasers.forEach((release, s) => { if (s !== source) release(); });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

export const CrosshairSyncContext = createContext<CrosshairSyncStore | null>(null);

const SVG_NS = 'http://www.w3.org/2000/svg';
const GROUP_CLASS = 'crosshair-sync';

/** Pixel position of a data value on a Plot scale, or null when it is not on the scale. */
function positionOf(scale: any, value: unknown): number | null {
  if (!scale || value == null) return null;
  if (scale.bandwidth !== undefined) {
    const inDomain = (scale.domain as unknown[]).some(
      (d) => d === value || (d instanceof Date && value instanceof Date && +d === +value),
    );
    if (!inDomain) return null;
  }
  const p = scale.apply(value);
  if (typeof p !== 'number' || !Number.isFinite(p)) return null;
  const px = p + (scale.bandwidth ?? 0) / 2;
  const [a, b] = (scale.range as number[]) ?? [];
  if (a !== undefined && b !== undefined) {
    const eps = 0.5;
    if (px < Math.min(a, b) - eps || px > Math.max(a, b) + eps) return null;
  }
  return px;
}

function scaleOf(plot: any, name: 'x' | 'y'): any {
  try {
    return plot.scale?.(name);
  } catch {
    return undefined;
  }
}

function extent(scale: any, fallback: number): [number, number] {
  const range = scale?.range as number[] | undefined;
  return range && range.length >= 2 ? [Math.min(...range), Math.max(...range)] : [0, fallback];
}

/**
 * Wire one rendered cell into the store: publish the point its own crosshair
 * snaps to, and draw the other cells' points as guide lines. Returns the
 * cleanup to run before the plot is replaced.
 */
export function attachCrosshairSync(
  plot: SVGSVGElement | HTMLElement,
  spec: CrosshairSpec,
  store: CrosshairSyncStore,
): () => void {
  const svg = (plot.tagName.toLowerCase() === 'svg' ? plot : plot.querySelector('svg')) as SVGSVGElement | null;
  if (!svg) return () => {};

  const source = {};
  const showX = spec.axes !== 'y';
  const showY = spec.axes !== 'x';
  let group: SVGGElement | null = null;

  // Plot's pointer pins its crosshair on click and only unpins on a click in
  // the same SVG. It holds that state privately, so unpin by sending it the
  // click it would otherwise never get. A pinned crosshair still has a point
  // while the pointer is elsewhere, which tells it apart from a hovered one.
  let releasing = false;
  const release = () => {
    if ((plot as any).value == null || typeof PointerEvent !== 'function') return;
    releasing = true;
    // The cell's pan handler would otherwise withhold it and start a pan.
    const click = new PointerEvent('pointerdown', { pointerType: 'mouse' });
    bypassViewportPan(click);
    svg.dispatchEvent(click);
    releasing = false;
  };
  const onPointerDown = (e: Event) => {
    if (releasing || (e as PointerEvent).pointerType !== 'mouse') return;
    store.releaseOthers(source);
  };
  // Capture: Plot's own handler on this SVG stops propagation.
  svg.addEventListener('pointerdown', onPointerDown, true);
  const unregisterRelease = store.registerRelease(source, release);

  const clear = () => {
    group?.remove();
    group = null;
  };

  const draw = (point: CrosshairPoint) => {
    clear();
    const xScale = scaleOf(plot, 'x');
    const yScale = scaleOf(plot, 'y');
    const width = Number(svg.getAttribute('width'));
    const height = Number(svg.getAttribute('height'));
    const lines: Array<[number, number, number, number]> = [];

    if (showX && point.spec.xColumn === spec.xColumn) {
      const px = positionOf(xScale, point.x);
      if (px != null) {
        const [top, bottom] = extent(yScale, height);
        lines.push([px, top, px, bottom]);
      }
    }
    if (showY && point.spec.yColumn === spec.yColumn) {
      const py = positionOf(yScale, point.y);
      if (py != null) {
        const [left, right] = extent(xScale, width);
        lines.push([left, py, right, py]);
      }
    }
    if (lines.length === 0) return;

    group = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    group.setAttribute('class', `${GROUP_CLASS} overlay-no-tooltip`);
    group.style.pointerEvents = 'none';
    for (const [x1, y1, x2, y2] of lines) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.style.stroke = T.chartGuideLine;
      line.style.strokeWidth = '1';
      line.style.strokeDasharray = '3,3';
      group.appendChild(line);
    }
    svg.appendChild(group);
  };

  // Plot dispatches the datum under its own pointer as `plot.value`.
  const onInput = () => {
    const d = (plot as any).value;
    if (d != null) clear();
    store.publish(source, d == null ? null : { spec, x: d[spec.xColumn], y: d[spec.yColumn] });
  };
  plot.addEventListener('input', onInput);

  const unsubscribe = store.subscribe((from, point) => {
    if (from === source) return;
    if (point) draw(point);
    else clear();
  });

  return () => {
    plot.removeEventListener('input', onInput);
    svg.removeEventListener('pointerdown', onPointerDown, true);
    unregisterRelease();
    unsubscribe();
    store.publish(source, null);
    clear();
  };
}
