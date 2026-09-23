// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useElementSize
 *
 * Tracks the content-box size of a single element via a *shared* singleton
 * `ResizeObserver`. Faceted grids mount one chart renderer per cell; if each
 * cell created its own `ResizeObserver` we would spin up N browser observers
 * for what the spec explicitly supports doing with one instance observing N
 * targets. This hook keeps a module-level observer and a `target → callback`
 * map: the observer is created lazily on first use and disconnected once the
 * last subscriber unmounts.
 */
import { useLayoutEffect, useState, RefObject } from 'react';
import { flushSync } from 'react-dom';

export interface ElementSize {
  width: number;
  height: number;
}

type SizeCallback = (size: ElementSize) => void;

const callbacks = new Map<Element, SizeCallback>();
let sharedObserver: ResizeObserver | null = null;

function getSharedObserver(): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') {
    // jsdom / SSR: no ResizeObserver. Callers keep their initial {0,0} size.
    return null;
  }
  if (!sharedObserver) {
    sharedObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cb = callbacks.get(entry.target);
        if (cb) {
          const { width, height } = entry.contentRect;
          cb({ width, height });
        }
      }
    });
  }
  return sharedObserver;
}

// Elements awaiting their first measurement, flushed together in one microtask.
const pendingInitial = new Set<Element>();

/**
 * First measurement, deferred to a microtask and batched across all cells.
 *
 * Measuring inside our own layout effect is too early: child layout effects run
 * before the parent's, so a parent that corrects layout in *its* layout effect
 * (ChartGrid's row height goes 120px → real on the first grid commit) leaves
 * every cell with a stale size — charts draw at the wrong size, then redraw
 * when the observer reports after paint. The microtask runs after React's
 * synchronous re-render but still before paint. All rects are read before any
 * state is set (one layout, no thrashing), then applied in a single flushSync
 * so the draws also land before paint.
 */
function flushInitialMeasurements() {
  const measured: Array<[SizeCallback, ElementSize]> = [];
  pendingInitial.forEach((el) => {
    const cb = callbacks.get(el);
    if (!cb) return; // unmounted in the meantime
    // Border-box rect; equals the observer's content box for the padding- and
    // border-free wrapper divs this hook measures.
    const rect = el.getBoundingClientRect();
    measured.push([cb, { width: rect.width, height: rect.height }]);
  });
  pendingInitial.clear();
  if (measured.length === 0) return;
  flushSync(() => {
    measured.forEach(([cb, size]) => cb(size));
  });
}

/**
 * Returns the observed element's `{ width, height }`. Pass a ref to the element
 * you want to measure. The element is observed through a process-wide shared
 * `ResizeObserver`.
 */
export function useElementSize(ref: RefObject<Element>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = getSharedObserver();
    if (!observer) return;

    // Skip no-op updates — the observer's initial callback reports the size we
    // already measured, and a fresh object would re-run every consumer's effect.
    const update = ({ width, height }: ElementSize) =>
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));

    callbacks.set(el, update);
    observer.observe(el);

    // The observer's initial callback only arrives after paint; measure before
    // it (see flushInitialMeasurements) so consumers don't draw at a fallback
    // size first.
    if (pendingInitial.size === 0) queueMicrotask(flushInitialMeasurements);
    pendingInitial.add(el);

    return () => {
      callbacks.delete(el);
      pendingInitial.delete(el);
      observer.unobserve(el);
      if (callbacks.size === 0 && sharedObserver) {
        sharedObserver.disconnect();
        sharedObserver = null;
      }
    };
  }, [ref]);

  return size;
}
