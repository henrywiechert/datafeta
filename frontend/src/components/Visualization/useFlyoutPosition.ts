// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Keeps a flyout (submenu, hover panel) inside the viewport.
 *
 * Measurement runs in a layout effect, so the correction is applied before the
 * browser paints and the flyout never visibly jumps.
 */

import { RefObject, useLayoutEffect, useState } from 'react';

const VIEWPORT_MARGIN_PX = 8;

export interface FlyoutPosition {
  /** Anchor to the container's left edge instead of its right. */
  openToLeft: boolean;
  /** Anchor to the container's bottom edge, so the flyout grows upward. */
  openUpward: boolean;
  /** Set only when the flyout does not fit in either direction. */
  maxHeight?: number;
}

export function useFlyoutPosition(
  containerRef: RefObject<HTMLElement>,
  flyoutRef: RefObject<HTMLElement>,
  isOpen: boolean,
): FlyoutPosition {
  const [position, setPosition] = useState<FlyoutPosition>({
    openToLeft: false,
    openUpward: false,
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const flyout = flyoutRef.current;
    if (!isOpen || !container || !flyout) return;

    const rect = container.getBoundingClientRect();
    // offsetWidth/scrollHeight are the natural size, unaffected by any maxHeight
    // a previous pass applied, so re-measuring cannot oscillate.
    const width = flyout.offsetWidth;
    const height = flyout.scrollHeight;

    const overflowsRight = rect.right + width > window.innerWidth - VIEWPORT_MARGIN_PX;
    const fitsOnLeft = rect.left - width > VIEWPORT_MARGIN_PX;

    const spaceBelow = window.innerHeight - rect.top - VIEWPORT_MARGIN_PX;
    const spaceAbove = rect.bottom - VIEWPORT_MARGIN_PX;

    let openUpward = false;
    let maxHeight: number | undefined;
    if (height > spaceBelow) {
      if (height <= spaceAbove) {
        openUpward = true;
      } else {
        // Taller than the viewport either way: take the roomier side and scroll.
        openUpward = spaceAbove > spaceBelow;
        maxHeight = Math.max(spaceAbove, spaceBelow);
      }
    }

    const next: FlyoutPosition = {
      openToLeft: overflowsRight && fitsOnLeft,
      openUpward,
      maxHeight,
    };
    setPosition(prev =>
      prev.openToLeft === next.openToLeft
        && prev.openUpward === next.openUpward
        && prev.maxHeight === next.maxHeight
        ? prev
        : next,
    );
  }, [isOpen, containerRef, flyoutRef]);

  return position;
}
