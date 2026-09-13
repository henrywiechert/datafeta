// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Push series-end labels apart after Observable Plot renders.
 *
 * The generator can only thin labels that collide in data space (see
 * `seriesEndLabels.ts`); it never sees the final plot size or real text
 * metrics, and Plot's `dx`/`dy` are constant mark options rather than channels,
 * so per-label offsets cannot be expressed in the spec. This pass does the
 * exact work in pixel space: sort the labels along the dodge axis, then greedily
 * shift each one just far enough to clear its predecessor, and hide the ones
 * that no longer fit inside the frame.
 */

import {
  SERIES_END_LABEL_DODGE_X_CLASS,
  SERIES_END_LABEL_DODGE_Y_CLASS,
} from '../../observable-plot-generator/utils/seriesEndLabels';

/** Breathing room between two adjacent labels, in pixels. */
const LABEL_GAP_PX = 2;

type Axis = 'x' | 'y';

function resolveAlongAxis(labels: SVGTextElement[], axis: Axis, frameSize: number): void {
  type Entry = { el: SVGTextElement; start: number; extent: number };

  const entries: Entry[] = [];
  for (const el of labels) {
    // Clear any offset from a previous pass so re-renders stay idempotent.
    el.removeAttribute('transform');
    el.style.removeProperty('display');
    let box: DOMRect;
    try {
      box = el.getBBox();
    } catch {
      // getBBox throws on elements that are not rendered (e.g. detached frame).
      return;
    }
    entries.push({
      el,
      start: axis === 'y' ? box.y : box.x,
      extent: axis === 'y' ? box.height : box.width,
    });
  }

  entries.sort((a, b) => a.start - b.start);

  // Total stack height/width; if the labels cannot possibly fit, bail out rather
  // than smearing them across the whole frame.
  const required = entries.reduce((sum, e) => sum + e.extent + LABEL_GAP_PX, -LABEL_GAP_PX);
  if (frameSize > 0 && required > frameSize) {
    return;
  }

  let floor = -Infinity;
  for (const entry of entries) {
    const target = Math.max(entry.start, floor);
    const shift = target - entry.start;
    if (shift > 0.5) {
      entry.el.setAttribute(
        'transform',
        axis === 'y' ? `translate(0,${shift.toFixed(2)})` : `translate(${shift.toFixed(2)},0)`
      );
    }
    floor = target + entry.extent + LABEL_GAP_PX;
  }

  // If the greedy pass pushed the tail past the frame, pull the whole stack back
  // so it stays visible; the labels keep their relative order either way.
  if (frameSize > 0 && floor - LABEL_GAP_PX > frameSize) {
    const overflow = floor - LABEL_GAP_PX - frameSize;
    for (const entry of entries) {
      const current = entry.el.getAttribute('transform');
      const existing = current
        ? Number.parseFloat(current.replace(/^translate\(|\)$/g, '').split(',')[axis === 'y' ? 1 : 0]) || 0
        : 0;
      const next = existing - overflow;
      entry.el.setAttribute(
        'transform',
        axis === 'y' ? `translate(0,${next.toFixed(2)})` : `translate(${next.toFixed(2)},0)`
      );
    }
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

    const svg = plot instanceof SVGSVGElement ? plot : plot.querySelector('svg');
    const frameSize = svg
      ? axis === 'y'
        ? svg.height?.baseVal?.value ?? 0
        : svg.width?.baseVal?.value ?? 0
      : 0;

    markGroups.forEach((group) => {
      const labels = Array.from(group.querySelectorAll<SVGTextElement>('text'));
      if (labels.length > 1) resolveAlongAxis(labels, axis, frameSize);
    });
  }
}
