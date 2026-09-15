// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

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
}

export interface UseSplitDragResult {
  isDragging: boolean;
  /** Clamped size under the pointer while dragging; null at rest. */
  dragSizePx: number | null;
  handleRef: RefObject<HTMLDivElement>;
  previewRef: RefObject<HTMLDivElement>;
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
 * Everything is measured in pixels — callers that ultimately need percentages
 * (react-resizable-panels panels) convert on commit, which keeps clamping
 * honest on narrow windows where "10%" and "a usable panel" disagree.
 */
export function useSplitDrag({
  orientation,
  panelSide,
  getBounds,
  onCommitPx,
}: UseSplitDragOptions): UseSplitDragResult {
  const handleRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const cancelDragRef = useRef<(() => void) | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSizePx, setDragSizePx] = useState<number | null>(null);

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
    const preview = previewRef.current;
    const handleRect = handleRef.current?.getBoundingClientRect();
    if (!bounds || !preview || !handleRect) return;

    event.preventDefault();
    const startPos = isVertical ? event.clientX : event.clientY;
    let committedSize = bounds.currentPx;

    // The preview is portalled to <body> with fixed positioning so it is not
    // clipped by the overflow:hidden panels it spans.
    if (isVertical) {
      preview.style.top = `${handleRect.top}px`;
      preview.style.height = `${handleRect.height}px`;
      preview.style.left = `${handleRect.left + handleRect.width / 2 - 1}px`;
      preview.style.width = '2px';
    } else {
      preview.style.left = `${handleRect.left}px`;
      preview.style.width = `${handleRect.width}px`;
      preview.style.top = `${handleRect.top + handleRect.height / 2 - 1}px`;
      preview.style.height = '2px';
    }
    preview.style.display = 'block';

    setIsDragging(true);
    setDragSizePx(bounds.currentPx);
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const pointerDelta = (isVertical ? moveEvent.clientX : moveEvent.clientY) - startPos;
      const requestedSize = panelSide === 'before'
        ? bounds.currentPx + pointerDelta
        : bounds.currentPx - pointerDelta;
      const nextSize = clamp(requestedSize, bounds.minPx, bounds.maxPx);
      committedSize = nextSize;
      setDragSizePx(nextSize);

      // Move the line by the *clamped* delta so it stops where the panel will.
      const lineOffset = panelSide === 'before'
        ? nextSize - bounds.currentPx
        : bounds.currentPx - nextSize;
      preview.style.transform = isVertical
        ? `translateX(${lineOffset}px)`
        : `translateY(${lineOffset}px)`;
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', cleanup);
      window.removeEventListener('keydown', handleKeyDown);
      preview.style.display = 'none';
      preview.style.transform = '';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      cancelDragRef.current = null;
      setIsDragging(false);
      setDragSizePx(null);
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
  }, [getBounds, isVertical, onCommitPx, panelSide]);

  useEffect(() => () => cancelDragRef.current?.(), []);

  return { isDragging, dragSizePx, handleRef, previewRef, onPointerDown, nudge, jumpTo };
}
