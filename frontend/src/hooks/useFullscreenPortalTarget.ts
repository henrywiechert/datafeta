// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useFullscreenPortalTarget
 *
 * Resolves the DOM node that React portals (chart tooltips) should render into.
 * When the document is in fullscreen mode, portals must render *inside* the
 * fullscreen element, otherwise they are not painted; otherwise they render to
 * `document.body`.
 *
 * Faceted grids mount one `ObservablePlot` per cell. If each cell registered its
 * own `fullscreenchange`-family listeners we would attach 4·N document listeners
 * and recompute the same target N times. This module keeps a single shared store:
 * the four listeners are attached once for the first subscriber and removed when
 * the last subscriber unmounts, and every subscriber reads the same resolved
 * target.
 */
import { useEffect, useState } from 'react';

type Subscriber = (target: HTMLElement) => void;

const FULLSCREEN_EVENTS = [
  'fullscreenchange',
  'webkitfullscreenchange',
  'mozfullscreenchange',
  'MSFullscreenChange',
] as const;

function resolveTarget(): HTMLElement {
  if (typeof document === 'undefined') {
    // SSR / non-DOM environments have no portal host.
    return null as unknown as HTMLElement;
  }
  const fullscreenElement = (document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement) as HTMLElement | null;
  return fullscreenElement || document.body;
}

const subscribers = new Set<Subscriber>();
let currentTarget: HTMLElement = resolveTarget();
let listening = false;

function handleChange(): void {
  const next = resolveTarget();
  if (next === currentTarget) return;
  currentTarget = next;
  subscribers.forEach((notify) => notify(next));
}

function startListening(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  // Re-resolve in case fullscreen state changed before the first subscriber.
  currentTarget = resolveTarget();
  FULLSCREEN_EVENTS.forEach((evt) => document.addEventListener(evt, handleChange));
}

function stopListening(): void {
  if (!listening || typeof document === 'undefined') return;
  listening = false;
  FULLSCREEN_EVENTS.forEach((evt) => document.removeEventListener(evt, handleChange));
}

/**
 * Returns the current portal target (the fullscreen element when active,
 * otherwise `document.body`), kept in sync via a single shared set of listeners.
 */
export function useFullscreenPortalTarget(): HTMLElement {
  const [target, setTarget] = useState<HTMLElement>(currentTarget);

  useEffect(() => {
    subscribers.add(setTarget);
    if (subscribers.size === 1) {
      startListening();
    }
    // Sync immediately in case the target changed before this subscriber mounted.
    setTarget(currentTarget);

    return () => {
      subscribers.delete(setTarget);
      if (subscribers.size === 0) {
        stopListening();
      }
    };
  }, []);

  return target;
}
