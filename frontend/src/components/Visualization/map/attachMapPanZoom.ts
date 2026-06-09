// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { MapViewBounds } from '../../../types';
import { zoomMapViewBounds } from '../../../utils/mapUtils';
import {
  clientPointToPlotPixel,
  panMapViewBoundsFromPixelDelta,
  plotPixelToLonLat,
} from '../../../utils/mapProjectionFit';
import { isPlotDataMarkElement } from '../plotMarkUtils';

export interface MapPanZoomHandlers {
  onViewChange: (plotId: string, bounds: MapViewBounds) => void;
  onViewReset: (plotId: string) => void;
  onHoverChange?: (plotId: string | null) => void;
}

export interface AttachMapPanZoomParams {
  svg: SVGSVGElement;
  /** Element that receives wheel events (figure wrapper when caption is present). */
  wheelRoot?: HTMLElement;
  plotId: string;
  homeBounds: MapViewBounds;
  currentView: MapViewBounds;
  width: number;
  height: number;
  handlers: MapPanZoomHandlers;
}

const WHEEL_ZOOM_INTENSITY = 0.002;
const MIN_WHEEL_SCALE = 0.85;
const MAX_WHEEL_SCALE = 1.18;
/** Idle delay before committing a wheel gesture (CSS preview stays fluid until then). */
const WHEEL_COMMIT_MS = 120;

/** Marks map plot roots so ChartGrid scroll sync skips wheel capture. */
export const MAP_WHEEL_ROOT_ATTR = 'data-map-wheel-root';
export const MAP_WHEEL_ROOT_SELECTOR = `[${MAP_WHEEL_ROOT_ATTR}]`;

function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

function isBrushModifier(event: MouseEvent | WheelEvent | PointerEvent): boolean {
  return isMacPlatform() ? event.metaKey : event.ctrlKey;
}

function sameViewBounds(a: MapViewBounds, b: MapViewBounds): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function wheelPreviewScale(gestureStart: MapViewBounds, view: MapViewBounds): number {
  const startLonSpan = Math.max(gestureStart[2] - gestureStart[0], 1e-6);
  const nextLonSpan = Math.max(view[2] - view[0], 1e-6);
  return Math.min(4, Math.max(0.25, startLonSpan / nextLonSpan));
}

/**
 * Attach wheel/drag pan-zoom to a map plot SVG. Commits geographic view bounds
 * (navigation only — no filter side effects).
 */
export function attachMapPanZoom({
  svg,
  wheelRoot,
  plotId,
  homeBounds,
  currentView,
  width,
  height,
  handlers,
}: AttachMapPanZoomParams): () => void {
  let viewState = currentView;
  let panStartView: MapViewBounds = currentView;
  let panStartClient: { x: number; y: number } | null = null;
  let activePointerId: number | null = null;
  let wheelCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let wheelGestureStartView: MapViewBounds | null = null;
  let wheelDirty = false;
  const wheelElement = wheelRoot ?? svg;

  const clearPanPreview = () => {
    svg.style.transform = '';
    svg.style.transformOrigin = '';
  };

  const applyWheelPreview = (plotX: number, plotY: number) => {
    if (!wheelGestureStartView) return;
    const previewScale = wheelPreviewScale(wheelGestureStartView, viewState);
    svg.style.transformOrigin = `${plotX}px ${plotY}px`;
    svg.style.transform = Math.abs(previewScale - 1) < 0.01 ? '' : `scale(${previewScale})`;
  };

  const commitWheelView = () => {
    if (wheelCommitTimer) {
      clearTimeout(wheelCommitTimer);
      wheelCommitTimer = null;
    }
    if (!wheelDirty) return;
    wheelDirty = false;
    wheelGestureStartView = null;
    handlers.onViewChange(plotId, viewState);
    // Keep CSS preview until ObservablePlot re-renders with the committed projection.
  };

  const scheduleWheelCommit = () => {
    if (wheelCommitTimer) clearTimeout(wheelCommitTimer);
    wheelCommitTimer = setTimeout(commitWheelView, WHEEL_COMMIT_MS);
  };

  const onWheel = (event: Event) => {
    if (!(event instanceof WheelEvent)) return;
    if (event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();

    const [plotX, plotY] = clientPointToPlotPixel(svg, event.clientX, event.clientY, width, height);
    const anchor = plotPixelToLonLat(viewState, width, height, plotX, plotY);
    if (!anchor) return;

    const rawK = Math.exp(-event.deltaY * WHEEL_ZOOM_INTENSITY);
    const k = Math.min(MAX_WHEEL_SCALE, Math.max(MIN_WHEEL_SCALE, rawK));
    if (Math.abs(k - 1) < 1e-6) return;

    if (!wheelGestureStartView) wheelGestureStartView = viewState;

    viewState = zoomMapViewBounds(viewState, k, anchor, homeBounds);
    wheelDirty = !sameViewBounds(viewState, currentView);
    applyWheelPreview(plotX, plotY);
    scheduleWheelCommit();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || isBrushModifier(event) || activePointerId != null) return;
    if (isPlotDataMarkElement(event.target instanceof Element ? event.target : null)) return;
    activePointerId = event.pointerId;
    panStartView = viewState;
    panStartClient = { x: event.clientX, y: event.clientY };
    svg.setPointerCapture(event.pointerId);
    svg.style.cursor = 'grabbing';
  };

  const onPointerMove = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId || !panStartClient) return;
    const dx = event.clientX - panStartClient.x;
    const dy = event.clientY - panStartClient.y;
    svg.style.transform = dx !== 0 || dy !== 0 ? `translate(${dx}px, ${dy}px)` : '';
  };

  const finishPan = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId || !panStartClient) return;
    const dx = event.clientX - panStartClient.x;
    const dy = event.clientY - panStartClient.y;
    clearPanPreview();
    if (dx !== 0 || dy !== 0) {
      const next = panMapViewBoundsFromPixelDelta(panStartView, dx, dy, width, height, homeBounds);
      viewState = next;
      handlers.onViewChange(plotId, next);
    }
    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
    activePointerId = null;
    panStartClient = null;
    svg.style.cursor = 'grab';
  };

  const onPointerUp = (event: PointerEvent) => {
    finishPan(event);
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return;
    clearPanPreview();
    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
    activePointerId = null;
    panStartClient = null;
    svg.style.cursor = 'grab';
  };

  const onDblClick = (event: MouseEvent) => {
    event.preventDefault();
    clearPanPreview();
    handlers.onViewReset(plotId);
  };

  svg.style.cursor = 'grab';
  svg.style.touchAction = 'none';
  wheelElement.setAttribute(MAP_WHEEL_ROOT_ATTR, '');

  const onMouseEnter = () => handlers.onHoverChange?.(plotId);
  const onMouseLeave = () => {
    if (activePointerId == null) {
      svg.style.cursor = 'grab';
    }
    handlers.onHoverChange?.(null);
  };

  wheelElement.addEventListener('wheel', onWheel, { passive: false, capture: true });
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerCancel);
  svg.addEventListener('dblclick', onDblClick);
  svg.addEventListener('mouseenter', onMouseEnter);
  svg.addEventListener('mouseleave', onMouseLeave);

  return () => {
    commitWheelView();
    wheelElement.removeEventListener('wheel', onWheel, true);
    svg.removeEventListener('pointerdown', onPointerDown);
    svg.removeEventListener('pointermove', onPointerMove);
    svg.removeEventListener('pointerup', onPointerUp);
    svg.removeEventListener('pointercancel', onPointerCancel);
    svg.removeEventListener('dblclick', onDblClick);
    svg.removeEventListener('mouseenter', onMouseEnter);
    svg.removeEventListener('mouseleave', onMouseLeave);
    clearPanPreview();
    wheelElement.removeAttribute(MAP_WHEEL_ROOT_ATTR);
    svg.style.cursor = '';
    svg.style.touchAction = '';
  };
}
