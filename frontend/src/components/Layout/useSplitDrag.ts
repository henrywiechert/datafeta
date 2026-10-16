// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { createSplitPreview, SplitPreviewStyle } from './splitDragPreview';

export type SplitOrientation = 'vertical' | 'horizontal';

/**
 * Which side of the handle the panel being resized sits on. A left sidebar is
 * `before` its handle (dragging right grows it); a legend or a debug drawer is
 * `after` its handle (dragging right/down shrinks it).
 */
export type SplitPanelSide = 'before' | 'after';

export interface SplitBounds {
  /** Current panel size along the resize axis, in pixels. */
  currentPx: number;
  minPx: number;
  maxPx: number;
}

export interface UseSplitDragOptions {
  /** `vertical` = a vertical divider between columns (drag along X). */
  orientation: SplitOrientation;
  panelSide: SplitPanelSide;
  /** Read live bounds at gesture start. Return null to refuse the gesture. */
  getBounds: () => SplitBounds | null;
  /** Called once with the final clamped size, in pixels. */
  onCommitPx: (px: number) => void;
  /** Resolved colors and font for the preview line and its size readout. */
  previewStyle: SplitPreviewStyle;
}

export interface UseSplitDragResult {
  isDragging: boolean;
  handleRef: RefObject<HTMLDivElement>;
  /**
   * Full-viewport layer shown for the length of the gesture. It carries the
   * resize cursor and `user-select: none`, and keeps hover effects underneath
   * from firing mid-drag.
   */
  overlayRef: RefObject<HTMLDivElement>;
  /** Canvas inside the overlay that the preview line and readout draw on. */
  previewRef: RefObject<HTMLCanvasElement>;
  onPointerDown: (event: React.PointerEvent) => void;
  /** Resize by a signed delta applied to the panel's own size. */
  nudge: (deltaPx: number) => void;
  jumpTo: (edge: 'min' | 'max') => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * The one resize gesture in the app.
 *
 * Deliberately deferred: dragging moves a preview line and the panel resizes
 * once on release. The chart column re-lays-out 160+ facets on every container
 * size change (debounced at 50ms in `useContainerDimensions`), so a live drag
 * would re-render the grid ~20x per second. Committing on release keeps the
 * gesture free regardless of what the panel contains.
 *
 * The preview itself is kept off React and off the rest of the page too: with
 * a large chart grid on screen, any repaint pays ~100ms of layerization and any
 * inherited-style change on <body> restyles every node. So the line and its
 * readout are drawn on a canvas whose bounds stay fixed for the gesture (see
 * `createSplitPreview`), and the cursor lives on the overlay, not on <body>.
 *
 * Everything is measured in pixels — callers that ultimately need percentages
 * (react-resizable-panels panels) convert on commit, which keeps clamping
 * honest on narrow windows where "10%" and "a usable panel" disagree.
 */
export function useSplitDrag({
  orientation,
  panelSide,
  getBounds,
  onCommitPx,
  previewStyle,
}: UseSplitDragOptions): UseSplitDragResult {
  const handleRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const cancelDragRef = useRef<(() => void) | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isVertical = orientation === 'vertical';

  const commitClamped = useCallback((sizePx: number) => {
    const bounds = getBounds();
    if (!bounds) return;
    onCommitPx(clamp(sizePx, bounds.minPx, bounds.maxPx));
  }, [getBounds, onCommitPx]);

  const nudge = useCallback((deltaPx: number) => {
    const bounds = getBounds();
    if (!bounds) return;
    commitClamped(bounds.currentPx + deltaPx);
  }, [commitClamped, getBounds]);

  const jumpTo = useCallback((edge: 'min' | 'max') => {
    const bounds = getBounds();
    if (!bounds) return;
    onCommitPx(edge === 'min' ? bounds.minPx : bounds.maxPx);
  }, [getBounds, onCommitPx]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;

    const bounds = getBounds();
    const handle = handleRef.current;
    const overlay = overlayRef.current;
    const preview = previewRef.current;
    if (!bounds || !handle || !overlay || !preview) return;
    const handleRect = handle.getBoundingClientRect();

    event.preventDefault();
    const startPos = isVertical ? event.clientX : event.clientY;
    let committedSize = bounds.currentPx;

    // Signed line offset from the handle for a panel size; the line moves by
    // the *clamped* delta so it stops where the panel will.
    const lineOffsetFor = (sizePx: number) => (panelSide === 'before'
      ? sizePx - bounds.currentPx
      : bounds.currentPx - sizePx);
    const offsetsAtBounds = [lineOffsetFor(bounds.minPx), lineOffsetFor(bounds.maxPx), 0];
    const labelFor = (sizePx: number) => `${Math.round(sizePx)}px`;

    // The overlay is portalled to <body> and covers the viewport, so the
    // preview is not clipped by the overflow:hidden panels it spans and
    // viewport coordinates position it directly.
    overlay.style.display = 'block';
    const paint = createSplitPreview(preview, {
      orientation,
      handleRect,
      minOffsetPx: Math.min(...offsetsAtBounds),
      maxOffsetPx: Math.max(...offsetsAtBounds),
      widestLabel: labelFor(Math.max(bounds.maxPx, bounds.currentPx)),
    }, previewStyle);

    const showSize = (sizePx: number) => {
      paint?.(lineOffsetFor(sizePx), labelFor(sizePx));
      handle.setAttribute('aria-valuenow', String(Math.round(sizePx)));
    };
    showSize(bounds.currentPx);

    setIsDragging(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const pointerDelta = (isVertical ? moveEvent.clientX : moveEvent.clientY) - startPos;
      const requestedSize = panelSide === 'before'
        ? bounds.currentPx + pointerDelta
        : bounds.currentPx - pointerDelta;
      const nextSize = clamp(requestedSize, bounds.minPx, bounds.maxPx);
      committedSize = nextSize;
      showSize(nextSize);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', cleanup);
      window.removeEventListener('keydown', handleKeyDown);
      overlay.style.display = 'none';
      handle.removeAttribute('aria-valuenow');
      cancelDragRef.current = null;
      setIsDragging(false);
    };

    const finishDrag = () => {
      cleanup();
      onCommitPx(committedSize);
    };

    // Escape abandons the drag with no resize — the preview line is the only
    // thing that moved, so there is nothing to roll back.
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        cleanup();
      }
    };

    cancelDragRef.current?.();
    cancelDragRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', cleanup);
    window.addEventListener('keydown', handleKeyDown);
  }, [getBounds, isVertical, onCommitPx, orientation, panelSide, previewStyle]);

  useEffect(() => () => cancelDragRef.current?.(), []);

  return {
    isDragging,
    handleRef,
    overlayRef,
    previewRef,
    onPointerDown,
    nudge,
    jumpTo,
  };
}
