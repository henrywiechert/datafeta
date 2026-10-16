// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import type { SplitOrientation } from './useSplitDrag';

/** Resolved colors and font for the drag preview; canvas needs real values. */
export interface SplitPreviewStyle {
  lineColor: string;
  labelBackground: string;
  labelColor: string;
  /** Canvas font shorthand, e.g. `400 12px Roboto, sans-serif`. */
  font: string;
}

export interface SplitPreviewGeometry {
  orientation: SplitOrientation;
  /** The handle at gesture start, in viewport coordinates. */
  handleRect: { left: number; top: number; width: number; height: number };
  /** Reachable line offsets along the drag axis, relative to the handle. */
  minOffsetPx: number;
  maxOffsetPx: number;
  /** Longest label the gesture can show; reserves room for the readout. */
  widestLabel: string;
}

/** Draws the line at a signed offset from the handle, with a size label. */
export type SplitPreviewPainter = (offsetPx: number, label: string) => void;

const LINE_PX = 2;
const LABEL_GAP_PX = 6;
const LABEL_INSET_PX = 8;
const LABEL_PAD_X_PX = 8;
const LABEL_HEIGHT_PX = 20;
const LABEL_RADIUS_PX = 4;

/**
 * Prepare `canvas` to show a split drag preview and return its painter, or
 * null when no 2D context is available (the gesture then runs unpreviewed).
 *
 * Why a canvas: with a large chart grid on screen, Chrome re-layerizes the
 * whole page (~100ms) whenever an element's painted bounds move — a line moved
 * by `transform` or `left`, with or without `will-change`, pays it every
 * frame. A canvas sized once to the line's whole travel range keeps its bounds
 * fixed; redrawing it never reaches layerization.
 */
export function createSplitPreview(
  canvas: HTMLCanvasElement,
  geometry: SplitPreviewGeometry,
  style: SplitPreviewStyle,
): SplitPreviewPainter | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.font = style.font;
  const labelSpacePx = Math.ceil(ctx.measureText(geometry.widestLabel).width) + 2 * LABEL_PAD_X_PX;
  const { handleRect, minOffsetPx, maxOffsetPx } = geometry;
  const isVertical = geometry.orientation === 'vertical';

  // Where the line sits at offset 0, and the box it and its label can reach.
  // A vertical line carries its label to the right, near the top; a
  // horizontal one carries it above, near the left end.
  const lineOrigin = isVertical
    ? handleRect.left + handleRect.width / 2 - LINE_PX / 2
    : handleRect.top + handleRect.height / 2 - LINE_PX / 2;
  const box = isVertical
    ? {
        left: lineOrigin + minOffsetPx,
        top: handleRect.top,
        width: maxOffsetPx - minOffsetPx + LINE_PX + LABEL_GAP_PX + labelSpacePx,
        height: handleRect.height,
      }
    : {
        left: handleRect.left,
        top: lineOrigin + minOffsetPx - LABEL_GAP_PX - LABEL_HEIGHT_PX,
        width: handleRect.width,
        height: maxOffsetPx - minOffsetPx + LINE_PX + LABEL_GAP_PX + LABEL_HEIGHT_PX,
      };

  const dpr = window.devicePixelRatio || 1;
  canvas.style.left = `${box.left}px`;
  canvas.style.top = `${box.top}px`;
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  canvas.width = Math.max(1, Math.round(box.width * dpr));
  canvas.height = Math.max(1, Math.round(box.height * dpr));
  // Resizing a canvas resets its context state.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = style.font;
  ctx.textBaseline = 'middle';

  return (offsetPx, label) => {
    ctx.clearRect(0, 0, box.width, box.height);

    const along = lineOrigin + offsetPx - (isVertical ? box.left : box.top);
    ctx.fillStyle = style.lineColor;
    if (isVertical) ctx.fillRect(along, 0, LINE_PX, box.height);
    else ctx.fillRect(0, along, box.width, LINE_PX);

    const labelWidth = Math.ceil(ctx.measureText(label).width) + 2 * LABEL_PAD_X_PX;
    const labelX = isVertical ? along + LINE_PX + LABEL_GAP_PX : LABEL_INSET_PX;
    const labelY = isVertical ? LABEL_INSET_PX : along - LABEL_GAP_PX - LABEL_HEIGHT_PX;
    ctx.fillStyle = style.labelBackground;
    roundedRectPath(ctx, labelX, labelY, labelWidth, LABEL_HEIGHT_PX, LABEL_RADIUS_PX);
    ctx.fill();
    ctx.fillStyle = style.labelColor;
    ctx.fillText(label, labelX + LABEL_PAD_X_PX, labelY + LABEL_HEIGHT_PX / 2);
  };
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
