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
import { useEffect, useState, RefObject } from 'react';

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

/**
 * Returns the observed element's `{ width, height }`. Pass a ref to the element
 * you want to measure. The element is observed through a process-wide shared
 * `ResizeObserver`.
 */
export function useElementSize(ref: RefObject<Element>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = getSharedObserver();
    if (!observer) return;

    callbacks.set(el, setSize);
    observer.observe(el);

    return () => {
      callbacks.delete(el);
      observer.unobserve(el);
      if (callbacks.size === 0 && sharedObserver) {
        sharedObserver.disconnect();
        sharedObserver = null;
      }
    };
  }, [ref]);

  return size;
}
