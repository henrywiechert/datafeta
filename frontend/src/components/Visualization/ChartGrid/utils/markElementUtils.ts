// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared helpers for working with Observable Plot's rendered SVG mark elements.
 *
 * Extracted from addTooltipListeners.ts so both the hover-tooltip wiring and
 * future pointer-driven features (e.g. span-measurement snapping) can locate
 * and read data marks without duplicating the grid/axis/overlay exclusion logic.
 */

/**
 * True when `el` sits inside a grid line, axis tick, or overlay-only group
 * (linear regression, moving average, measurement guides, etc.) rather than a
 * rendered data mark. Mirrors Observable Plot's aria-label conventions
 * ("x-grid", "y-axis", ...) plus the app's own `overlay-no-tooltip` class.
 */
export function isDecorationElement(el: Element, root: Element): boolean {
  let parent: Element | null = el.parentElement;
  while (parent && parent !== root) {
    if (parent.classList.contains('overlay-no-tooltip')) {
      return true;
    }
    const ariaLabel = parent.getAttribute('aria-label');
    if (ariaLabel) {
      const labelLower = ariaLabel.toLowerCase();
      if (labelLower.includes('grid') || labelLower.includes('axis')) {
        return true;
      }
    }
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Select all rendered data-mark elements under `root`, excluding grid lines,
 * axis ticks, and overlay-only marks.
 */
export function queryDataMarkElements(root: Element): Element[] {
  const allElements = root.querySelectorAll(
    'circle, rect, path[fill]:not([fill="none"]), path[stroke]:not([stroke="none"]):not([stroke="transparent"]), line'
  );
  return Array.from(allElements).filter((el) => !isDecorationElement(el, root));
}

/**
 * Resolve the datum Observable Plot attached to a mark element, falling back
 * to a positional lookup in `data` (by element index, or by an index value
 * stored directly on the element) when `__data__` isn't present.
 */
export function getMarkDatum(element: Element, index: number, data?: any[]): any {
  let datum = (element as any).__data__;

  // Plot binds the row index as __data__, so 0 is a valid value — only fall back when absent.
  if (datum == null && data && data.length > 0 && index < data.length) {
    datum = data[index];
  }

  if (typeof datum === 'number' && data && datum < data.length) {
    datum = data[datum];
  }

  return datum;
}

export interface NearestMarkMatch {
  element: Element;
  distancePx: number;
}

/**
 * Find the closest element to `point` among `candidates`, measured against
 * each candidate's anchor position (circle cx/cy, or element center via
 * getBoundingClientRect for other shapes). Returns null when `candidates` is
 * empty or `maxDistancePx` excludes every candidate.
 *
 * Intended for pointer-driven snapping (e.g. measurement endpoints) where the
 * target mark may not be directly under the pointer, unlike hover tooltips
 * which rely on native mouseenter/mouseleave hit-testing.
 */
export function findNearestMarkElement(
  candidates: Element[],
  point: { clientX: number; clientY: number },
  maxDistancePx: number = Infinity
): NearestMarkMatch | null {
  let best: NearestMarkMatch | null = null;

  for (const el of candidates) {
    const anchor = getElementAnchorPoint(el);
    if (!anchor) continue;

    const distancePx = Math.hypot(anchor.x - point.clientX, anchor.y - point.clientY);
    if (distancePx > maxDistancePx) continue;
    if (!best || distancePx < best.distancePx) {
      best = { element: el, distancePx };
    }
  }

  return best;
}

/** Anchor point (in viewport/client coordinates) used for proximity search. */
function getElementAnchorPoint(el: Element): { x: number; y: number } | null {
  if (el.tagName.toLowerCase() === 'circle') {
    const svgRoot = (el as SVGGraphicsElement).ownerSVGElement;
    const cx = Number(el.getAttribute('cx'));
    const cy = Number(el.getAttribute('cy'));
    if (svgRoot && Number.isFinite(cx) && Number.isFinite(cy)) {
      const pt = clientPointFromSvgCoords(svgRoot, cx, cy);
      if (pt) return pt;
    }
  }

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Convert an SVG-user-space point to client (viewport) coordinates. */
function clientPointFromSvgCoords(svgRoot: SVGSVGElement, x: number, y: number): { x: number; y: number } | null {
  if (typeof svgRoot.createSVGPoint !== 'function') return null;
  const ctm = svgRoot.getScreenCTM();
  if (!ctm) return null;
  const pt = svgRoot.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const screenPt = pt.matrixTransform(ctm);
  return { x: screenPt.x, y: screenPt.y };
}
