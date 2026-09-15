// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { RefObject, useCallback, useMemo } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { SplitBounds } from './useSplitDrag';

export interface PanelConstraints {
  /**
   * Smallest useful size in pixels. Panel minima are a property of their
   * content (a 140px control needs 140px), not of the window — "10%" is 110px
   * on a 1100px window, which is why these are not percentages.
   */
  minPx: number;
  /**
   * Largest share of the group, as a percentage. Maxima *are* proportional:
   * a sidebar should not eat the chart on a wide screen.
   */
  maxPercent: number;
}

/**
 * Adapts a react-resizable-panels panel to the pixel-based split gesture.
 *
 * This is the only place that converts between the library's percentages and
 * the gesture's pixels, and the only place that needs the group width.
 */
export function usePanelSplit(
  panelRef: RefObject<PanelImperativeHandle>,
  { minPx, maxPercent }: PanelConstraints,
) {
  const getBounds = useCallback((): SplitBounds | null => {
    const panel = panelRef.current;
    if (!panel) return null;

    const size = panel.getSize();
    // Recover the group's own width from the panel's two representations of
    // itself. A collapsed panel is 0% of the group, so fall back to the panel
    // element's parent in that case.
    const groupPx = size.asPercentage > 0
      ? size.inPixels / (size.asPercentage / 100)
      : 0;
    if (groupPx <= 0) return null;

    return {
      currentPx: size.inPixels,
      minPx: Math.min(minPx, groupPx),
      maxPx: (groupPx * maxPercent) / 100,
    };
  }, [maxPercent, minPx, panelRef]);

  const onCommitPx = useCallback((px: number) => {
    // The library validates against the Panel's own min/max as well, so the
    // declared constraints stay authoritative even if these drift.
    panelRef.current?.resize(`${px}px`);
  }, [panelRef]);

  return useMemo(() => ({ getBounds, onCommitPx }), [getBounds, onCommitPx]);
}
