// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Keyboard pan/zoom for the plot cell under the pointer:
 * - W / S: zoom in / out around the centre
 * - A / D: pan towards lower / higher values (earlier / later in time)
 * - R: reset the cell's columns to their natural domain
 *
 * Active while the pointer is over the grid and a cell declares pannable axes.
 */
import { useEffect, type RefObject } from 'react';
import type { ViewportRange } from '../../../../observable-plot-generator/viewport/chartViewport';
import type { CellViewportAxis, ViewportController, ViewportPatch } from './viewportController';
import { currentRange } from './useViewportGestures';
import { minSpanFor, panBy, zoomAt } from './viewportMath';

/** Zoom/pan factor per key press (20%) */
const ZOOM_PAN_FACTOR = 0.2;

/** Key repeat delay for held keys (ms) */
const KEY_REPEAT_DELAY = 150;

type KeyAction = 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight';

const KEY_ACTIONS: Record<string, KeyAction> = {
  w: 'zoomIn',
  s: 'zoomOut',
  a: 'panLeft',
  d: 'panRight',
};

function applyAction(range: ViewportRange, axis: CellViewportAxis, action: KeyAction): ViewportRange | null {
  const span = range.max - range.min;
  const center = (range.min + range.max) / 2;
  const minSpan = minSpanFor(axis.bounds, axis.temporal);
  switch (action) {
    case 'zoomIn':
      return zoomAt(range, center, 1 - ZOOM_PAN_FACTOR, axis.bounds, minSpan);
    case 'zoomOut':
      return zoomAt(range, center, 1 + ZOOM_PAN_FACTOR, axis.bounds, minSpan);
    case 'panLeft':
      return panBy(range, -span * ZOOM_PAN_FACTOR, axis.bounds);
    case 'panRight':
      return panBy(range, span * ZOOM_PAN_FACTOR, axis.bounds);
  }
}

/** Pans act on one axis (x preferred); zooms act on every pannable axis of the cell. */
function runAction(controller: ViewportController, action: KeyAction): void {
  const axes = controller.getHoveredCell()?.resolveAxes() ?? [];
  if (axes.length === 0) return;
  const isPan = action === 'panLeft' || action === 'panRight';
  const targets = isPan ? [axes.find((a) => a.axis === 'x') ?? axes[0]] : axes;
  const patch: ViewportPatch = {};
  for (const axis of targets) {
    patch[axis.column] = applyAction(currentRange(controller, axis), axis, action);
  }
  controller.set(patch);
}

export function useViewportKeyboard(
  containerRef: RefObject<HTMLElement>,
  controller: ViewportController | undefined,
  enabled: boolean,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !controller || !enabled) return;

    // Effect may (re-)run under a resting pointer, when no mouseenter follows.
    let isActive = false;
    try {
      isActive = container.matches(':hover');
    } catch {
      // ':hover' unsupported (e.g. test DOM)
    }
    const heldKeys = new Set<string>();
    let repeatTimer: ReturnType<typeof setInterval> | null = null;
    const stopRepeat = () => {
      if (repeatTimer) clearInterval(repeatTimer);
      repeatTimer = null;
    };

    const handleMouseEnter = () => {
      isActive = true;
    };
    const handleMouseLeave = () => {
      isActive = false;
      heldKeys.clear();
      stopRepeat();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!(key in KEY_ACTIONS) && key !== 'r') return;
      if (!isActive || e.ctrlKey || e.metaKey || e.altKey) return;

      // Don't intercept keys when user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      e.preventDefault();

      if (key === 'r') {
        const columns = controller.getHoveredCell()?.resolveAxes().map((a) => a.column) ?? [];
        if (columns.length > 0) controller.clear(columns);
        return;
      }

      // If key is already held, the repeat timer handles it
      if (heldKeys.has(key)) return;
      heldKeys.add(key);
      runAction(controller, KEY_ACTIONS[key]);
      if (!repeatTimer) {
        repeatTimer = setInterval(() => {
          heldKeys.forEach((k) => runAction(controller, KEY_ACTIONS[k]));
        }, KEY_REPEAT_DELAY);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!(key in KEY_ACTIONS)) return;
      heldKeys.delete(key);
      if (heldKeys.size === 0) stopRepeat();
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      stopRepeat();
    };
  }, [containerRef, controller, enabled]);
}
