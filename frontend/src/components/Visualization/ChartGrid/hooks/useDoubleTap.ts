// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useMemo, useRef } from 'react';

/** Max gap between the two taps (ms) */
const DOUBLE_TAP_MS = 300;

/** Max finger travel within a tap, and between the two taps (px) */
const TAP_SLOP_PX = 20;

/** Window after firing in which the release's synthetic click is swallowed (ms) */
const CLICK_SUPPRESS_MS = 400;

export interface DoubleTapHandlers {
  onPointerDownCapture: (e: React.PointerEvent) => void;
  onPointerUpCapture: (e: React.PointerEvent) => void;
}

/**
 * Touch double tap → `onDoubleTap()`. Mouse and pen pointers are ignored.
 * A drag that the browser turns into a scroll ends in pointercancel instead of
 * pointerup, so it never counts as a tap. Handlers run in the capture phase
 * because Plot's pointer interaction stops propagation of pointerdown on the SVG.
 */
export function useDoubleTap(onDoubleTap: (() => void) | undefined): DoubleTapHandlers {
  const onDoubleTapRef = useRef(onDoubleTap);
  onDoubleTapRef.current = onDoubleTap;

  const downRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null);

  return useMemo(() => {
    const suppressNextClick = () => {
      const swallow = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), CLICK_SUPPRESS_MS);
    };

    return {
      onPointerDownCapture: (e: React.PointerEvent) => {
        downRef.current = e.pointerType === 'touch' && e.isPrimary ? { x: e.clientX, y: e.clientY } : null;
      },
      onPointerUpCapture: (e: React.PointerEvent) => {
        const down = downRef.current;
        downRef.current = null;
        if (!down || e.pointerType !== 'touch' || !onDoubleTapRef.current) return;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP_PX) return;

        const now = Date.now();
        const last = lastTapRef.current;
        if (
          last &&
          now - last.time < DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - last.x, e.clientY - last.y) <= TAP_SLOP_PX
        ) {
          lastTapRef.current = null;
          suppressNextClick();
          onDoubleTapRef.current();
          return;
        }
        lastTapRef.current = { x: e.clientX, y: e.clientY, time: now };
      },
    };
  }, []);
}
