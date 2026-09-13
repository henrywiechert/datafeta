// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Push series-end labels apart after Observable Plot renders.
 *
 * The generator emits one label per series and leaves all collision handling
 * here (see `seriesEndLabels.ts`): it never sees the final plot size or real
 * text metrics, and Plot's `dx`/`dy` are constant mark options rather than
 * channels, so per-label offsets cannot be expressed in the spec. This pass
 * sorts the labels along the dodge axis, shifts only those that have to move
 * in order to clear their neighbour, and hides any the axis cannot fit.
 *
 * Plot positions each `<text>` with its own `transform="translate(x,y)"`
 * (optionally followed by a rotate), so the offset has to be folded into that
 * transform rather than replacing it — clearing it would drop the label onto
 * the mark group's origin. For the same reason `getBBox()` is only used for
 * text *metrics*: it reports the box in the element's own coordinate system
 * and therefore excludes the translate that positions it.
 */

import {
  SERIES_END_LABEL_DODGE_X_CLASS,
  SERIES_END_LABEL_DODGE_Y_CLASS,
} from '../../observable-plot-generator/utils/seriesEndLabels';

/** Breathing room between two adjacent labels, in pixels. */
const LABEL_GAP_PX = 2;

type Axis = 'x' | 'y';

/** The translate Plot rendered, plus whatever followed it (e.g. a rotate). */
type Anchor = { x: number; y: number; suffix: string };

const TRANSLATE_RE = /^\s*translate\(\s*([-+\d.eE]+)\s*[,\s]\s*([-+\d.eE]+)\s*\)/;

/**
 * Plot's own translate for this label, cached so repeated passes over the same
 * DOM stay idempotent (the second pass must not treat a shifted label as its
 * anchor).
 */
function readAnchor(el: SVGTextElement): Anchor {
  const cached = (el as any).__seriesEndLabelAnchor as Anchor | undefined;
  if (cached) return cached;

  const transform = el.getAttribute('transform') ?? '';
  const match = TRANSLATE_RE.exec(transform);
  const anchor: Anchor = match
    ? { x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]), suffix: transform.slice(match[0].length) }
    : { x: 0, y: 0, suffix: transform };

  (el as any).__seriesEndLabelAnchor = anchor;
  return anchor;
}

function applyOffset(el: SVGTextElement, anchor: Anchor, offset: number, axis: Axis): void {
  const x = axis === 'x' ? anchor.x + offset : anchor.x;
  const y = axis === 'y' ? anchor.y + offset : anchor.y;
  el.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)})${anchor.suffix}`);
}

function resolveAlongAxis(labels: SVGTextElement[], axis: Axis, frameSize: number): void {
  type Entry = { el: SVGTextElement; anchor: Anchor; desired: number; extent: number; pos: number };

  const entries: Entry[] = [];
  for (const el of labels) {
    const anchor = readAnchor(el);
    // A label hidden by an earlier pass has to be revealed before measuring:
    // getBBox reports an empty box for `display: none`.
    el.style.removeProperty('display');
    let box: DOMRect;
    try {
      box = el.getBBox();
    } catch {
      // getBBox throws on elements that are not rendered (e.g. detached frame).
      return;
    }
    // getBBox is local to the element, so the anchor supplies the absolute part.
    const desired = axis === 'y' ? anchor.y + box.y : anchor.x + box.x;
    entries.push({
      el,
      anchor,
      desired,
      extent: axis === 'y' ? box.height : box.width,
      pos: desired,
    });
  }

  entries.sort((a, b) => a.desired - b.desired);

  // Forward pass: push each label just far enough to clear its predecessor.
  let floor = 0;
  for (const entry of entries) {
    entry.pos = Math.max(entry.desired, floor);
    floor = entry.pos + entry.extent + LABEL_GAP_PX;
  }

  // Backward pass: pull back only the labels that now overflow the far edge,
  // so a cluster near the end of the axis stays near its lines instead of the
  // whole stack being dragged across the frame.
  if (frameSize > 0) {
    let ceiling = frameSize;
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      entry.pos = Math.min(entry.pos, ceiling - entry.extent);
      ceiling = entry.pos - LABEL_GAP_PX;
    }
  }

  for (const entry of entries) {
    // Both passes clamp into the frame, so a position that ended up before its
    // start means the axis ran out of room for this label. Overlapping text is
    // unreadable, so drop it and keep the labels that do fit.
    if (entry.pos < 0) {
      entry.el.style.display = 'none';
      applyOffset(entry.el, entry.anchor, 0, axis);
      continue;
    }
    applyOffset(entry.el, entry.anchor, entry.pos - entry.desired, axis);
  }
}

/**
 * Resolve series-end label collisions in the rendered plot.
 * No-op when the plot has no series-end labels, which is the common case.
 */
export function deOverlapSeriesLabels(plot: SVGSVGElement | HTMLElement): void {
  const groups: Array<{ axis: Axis; selector: string }> = [
    { axis: 'y', selector: `g.${SERIES_END_LABEL_DODGE_Y_CLASS}` },
    { axis: 'x', selector: `g.${SERIES_END_LABEL_DODGE_X_CLASS}` },
  ];

  for (const { axis, selector } of groups) {
    const markGroups = plot.querySelectorAll<SVGGElement>(selector);
    if (markGroups.length === 0) continue;

    markGroups.forEach((group) => {
      const labels = Array.from(group.querySelectorAll<SVGTextElement>('text'));
      if (labels.length <= 1) return;

      const svg = group.ownerSVGElement;
      const frameSize = svg
        ? axis === 'y'
          ? svg.height?.baseVal?.value ?? 0
          : svg.width?.baseVal?.value ?? 0
        : 0;

      resolveAlongAxis(labels, axis, frameSize);
    });
  }
}
