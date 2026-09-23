// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Push series-end labels apart after Observable Plot renders.
 *
 * The generator emits one label per series and leaves all collision handling
 * here (see `seriesEndLabels.ts`): it never sees the final plot size or real
 * text metrics, and Plot's `dx`/`dy` are constant mark options rather than
 * channels, so per-label offsets cannot be expressed in the spec. This pass
 * hides the lowest-priority labels the axis cannot fit, then spaces out the
 * rest.
 *
 * Plot positions each `<text>` with its own `transform="translate(x,y)"`
 * (optionally followed by a rotate), so the offset has to be folded into that
 * transform rather than replacing it — clearing it would drop the label onto
 * the mark group's origin. For the same reason `getBBox()` is only used for
 * text *metrics*: it reports the box in the element's own coordinate system
 * and therefore excludes the translate that positions it.
 *
 * Crowded labels are centred on their lines as a group, and any group that had
 * to move gets thin leader lines back to the line ends so each label stays
 * attributable even when colours are similar.
 */

import {
  SERIES_END_LABEL_DODGE_X_CLASS,
  SERIES_END_LABEL_DODGE_Y_CLASS,
  SERIES_END_LABEL_LEADER_CLASS,
  SERIES_END_LABEL_LEADER_INDENT_PX,
} from '../../observable-plot-generator/utils/seriesEndLabels';

/** Breathing room between two adjacent labels, in pixels. */
const LABEL_GAP_PX = 2;

/** A cluster moved further than this from its lines gets leader lines. */
const LEADER_MIN_SHIFT_PX = 3;

/** Clearance between a leader line and the point / label it connects. */
const LEADER_GAP_PX = 2;

const SVG_NS = 'http://www.w3.org/2000/svg';

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

/**
 * The mark's `dx`/`dy`. Plot applies them to the mark's `<g>`, while each
 * `<text>` is translated to the exact data point, so subtracting this offset
 * from a label's anchor gives the end of its line in the group's coordinates.
 * (Plot's half-pixel crisp-edge offset is folded in too; it is not worth
 * separating out.)
 */
function readGroupOffset(group: SVGGElement): { x: number; y: number } {
  const match = TRANSLATE_RE.exec(group.getAttribute('transform') ?? '');
  return match
    ? { x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]) }
    : { x: 0, y: 0 };
}

function applyOffset(el: SVGTextElement, anchor: Anchor, ox: number, oy: number): void {
  el.setAttribute('transform', `translate(${(anchor.x + ox).toFixed(2)},${(anchor.y + oy).toFixed(2)})${anchor.suffix}`);
}

type Entry = {
  el: SVGTextElement;
  anchor: Anchor;
  box: DOMRect;
  /** Label start along the dodge axis, where Plot put it. */
  desired: number;
  extent: number;
  pos: number;
};

type Cluster = { entries: Entry[]; start: number; size: number; sum: number };

/**
 * Where a cluster starts: centred on its lines, then clamped into the frame.
 *
 * Label i sits at `start + offset_i`, so centring the stack on the mean of the
 * desired positions gives `start = mean(desired_i - offset_i)`; `sum` holds
 * that numerator.
 */
function placeCluster(cluster: Cluster, frameSize: number): void {
  const centred = cluster.sum / cluster.entries.length;
  cluster.start = frameSize > 0
    ? Math.max(0, Math.min(centred, frameSize - cluster.size))
    : centred;
}

/**
 * Lay labels out along the dodge axis.
 *
 * Overlapping labels are merged into clusters that are centred on their lines,
 * so a crowded group spreads out evenly in both directions rather than stacking
 * away from the first label. Clusters are clamped into the frame and re-merged
 * whenever clamping or growth makes them collide with their neighbour.
 */
function layoutClusters(entries: Entry[], frameSize: number): Cluster[] {
  const sorted = [...entries].sort((a, b) => a.desired - b.desired);
  const clusters: Cluster[] = [];

  for (const entry of sorted) {
    let cluster: Cluster = { entries: [entry], start: 0, size: entry.extent, sum: entry.desired };
    placeCluster(cluster, frameSize);

    while (clusters.length > 0) {
      const prev = clusters[clusters.length - 1];
      if (prev.start + prev.size + LABEL_GAP_PX <= cluster.start) break;
      clusters.pop();
      // Every label of the later cluster moves down by the earlier one's size.
      const shift = prev.size + LABEL_GAP_PX;
      cluster = {
        entries: [...prev.entries, ...cluster.entries],
        start: 0,
        size: prev.size + LABEL_GAP_PX + cluster.size,
        sum: prev.sum + cluster.sum - shift * cluster.entries.length,
      };
      placeCluster(cluster, frameSize);
    }
    clusters.push(cluster);
  }

  for (const cluster of clusters) {
    let pos = cluster.start;
    for (const entry of cluster.entries) {
      entry.pos = pos;
      pos += entry.extent + LABEL_GAP_PX;
    }
  }
  return clusters;
}

/**
 * Thin connector from a line's end to its displaced label, in the label's
 * colour. Copies the label's `data-cat` so series highlighting dims it too.
 */
function appendLeader(
  group: SVGGElement,
  entry: Entry,
  axis: Axis,
  groupOffset: { x: number; y: number },
  indent: number,
): void {
  const { anchor, box } = entry;
  const shift = entry.pos - entry.desired;
  let x1: number, y1: number, x2: number, y2: number;

  if (axis === 'y') {
    // Labels sit beside the line end; `side` is +1 when they are to its right.
    const side = Math.sign(groupOffset.x);
    x1 = anchor.x - groupOffset.x + side * LEADER_GAP_PX;
    y1 = anchor.y - groupOffset.y;
    const left = anchor.x + side * indent + box.x;
    x2 = (side > 0 ? left : left + box.width) - side * LEADER_GAP_PX;
    y2 = anchor.y + shift + box.y + box.height / 2;
  } else {
    // Labels sit above (side -1) or below (side +1) the line end.
    const side = Math.sign(groupOffset.y);
    x1 = anchor.x - groupOffset.x;
    y1 = anchor.y - groupOffset.y + side * LEADER_GAP_PX;
    x2 = anchor.x + shift + box.x + box.width / 2;
    const top = anchor.y + side * indent + box.y;
    y2 = (side > 0 ? top : top + box.height) - side * LEADER_GAP_PX;
  }

  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('class', SERIES_END_LABEL_LEADER_CLASS);
  line.setAttribute('x1', x1.toFixed(2));
  line.setAttribute('y1', y1.toFixed(2));
  line.setAttribute('x2', x2.toFixed(2));
  line.setAttribute('y2', y2.toFixed(2));
  line.setAttribute('stroke', entry.el.getAttribute('fill') ?? 'currentColor');
  line.setAttribute('stroke-width', '1');
  line.setAttribute('stroke-opacity', '0.7');
  const cat = entry.el.getAttribute('data-cat');
  if (cat != null) line.setAttribute('data-cat', cat);
  // First child, so the labels' halo paints over the leader's end.
  group.insertBefore(line, group.firstChild);
}

function resolveAlongAxis(group: SVGGElement, labels: SVGTextElement[], axis: Axis, frameSize: number): void {
  group.querySelectorAll(`line.${SERIES_END_LABEL_LEADER_CLASS}`).forEach((line) => line.remove());

  // `labels` is in DOM order, which the generator sets to priority order
  // (see `createSeriesEndLabelMark`): when space runs out, drop from the end.
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
      box,
      desired,
      extent: axis === 'y' ? box.height : box.width,
      pos: desired,
    });
  }

  // Overlapping text is unreadable, so keep only as many labels as the axis can
  // hold, sacrificing the least important series first.
  let kept = entries;
  if (frameSize > 0) {
    let needed = entries.reduce((sum, e) => sum + e.extent, 0) + LABEL_GAP_PX * (entries.length - 1);
    let count = entries.length;
    while (count > 1 && needed > frameSize) {
      count -= 1;
      needed -= entries[count].extent + LABEL_GAP_PX;
    }
    kept = entries.slice(0, count);
    for (const entry of entries.slice(count)) {
      entry.el.style.display = 'none';
      applyOffset(entry.el, entry.anchor, 0, 0);
    }
  }

  const groupOffset = readGroupOffset(group);
  // Leaders need room to be visible, so a displaced cluster is pushed further
  // away from its lines — on the axis that does not dodge.
  const side = Math.sign(axis === 'y' ? groupOffset.x : groupOffset.y);
  const indent = side === 0 ? 0 : SERIES_END_LABEL_LEADER_INDENT_PX;

  for (const cluster of layoutClusters(kept, frameSize)) {
    const displaced = cluster.entries.some((e) => Math.abs(e.pos - e.desired) > LEADER_MIN_SHIFT_PX);
    const clusterIndent = displaced ? indent : 0;

    for (const entry of cluster.entries) {
      const shift = entry.pos - entry.desired;
      if (axis === 'y') applyOffset(entry.el, entry.anchor, side * clusterIndent, shift);
      else applyOffset(entry.el, entry.anchor, shift, side * clusterIndent);
      if (displaced) appendLeader(group, entry, axis, groupOffset, clusterIndent);
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

    markGroups.forEach((group) => {
      const labels = Array.from(group.querySelectorAll<SVGTextElement>('text'));
      if (labels.length <= 1) return;

      const svg = group.ownerSVGElement;
      const frameSize = svg
        ? axis === 'y'
          ? svg.height?.baseVal?.value ?? 0
          : svg.width?.baseVal?.value ?? 0
        : 0;

      resolveAlongAxis(group, labels, axis, frameSize);
    });
  }
}
