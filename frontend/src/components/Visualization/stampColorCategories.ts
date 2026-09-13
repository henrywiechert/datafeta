// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Stamp `data-cat` attributes on SVG mark elements after Observable Plot
 * renders.  Each element's D3 data-binding (`__data__`) is resolved to the
 * original datum (via the tooltip data array), and the value of the color
 * category field is written as a data attribute.
 *
 * This allows the series-highlight hook to match elements by their actual
 * category value (via CSS `[data-cat="…"]` selectors) rather than by fill
 * colour — which breaks when the palette wraps and multiple categories share
 * the same colour.
 */

import { DENSITY_CAT_CLASS_PREFIX } from '../../observable-plot-generator/overlays/density';
import { SERIES_END_LABEL_CLASS } from '../../observable-plot-generator/utils/seriesEndLabels';

const MARK_SELECTOR = [
  'circle',
  'rect',
  'path[fill]:not([fill="none"])',
  'path[stroke]:not([stroke="none"])',
  'line',
].join(', ');

function isInsideGridOrAxis(el: Element, root: Element): boolean {
  let parent = el.parentElement;
  while (parent && parent !== root) {
    const ariaLabel = parent.getAttribute('aria-label');
    if (ariaLabel) {
      const lower = ariaLabel.toLowerCase();
      if (lower.includes('grid') || lower.includes('axis') || lower.includes('frame')) {
        return true;
      }
    }
    parent = parent.parentElement;
  }
  return false;
}

export function encodeCatValue(v: any): string {
  // Keep encoded values CSS-selector-safe (no control chars).
  if (v == null) return '__NULL__';
  if (v instanceof Date) return `__DATE__:${v.valueOf()}`;
  return String(v);
}

/**
 * Reverse of density.ts::encodeCatForClass.
 * Decodes a URL-safe base64 string back to the encodeCatValue representation.
 */
function decodeDensityCatClass(encoded: string): string {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const rem = base64.length % 4;
    const padded = rem ? base64 + '='.repeat(4 - rem) : base64;
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    return encoded;
  }
}

/**
 * Resolve an element's D3 data binding to the original row object.
 *
 * Observable Plot v0.6.x data binding varies by mark type:
 *  - dot/bar/text marks: a single index (number) into the data array
 *  - line/area marks: an array of indices (one path per series)
 */
function resolveDatum(el: Element, data: any[] | undefined): any | null {
  let datum = (el as any).__data__;

  if (Array.isArray(datum)) {
    const firstIdx = datum[0];
    if (typeof firstIdx === 'number' && data && firstIdx < data.length) {
      datum = data[firstIdx];
    } else if (firstIdx && typeof firstIdx === 'object') {
      // Some marks bind an array of row objects instead of row indices.
      datum = firstIdx;
    } else {
      return null;
    }
  } else if (typeof datum === 'number' && data && datum < data.length) {
    datum = data[datum];
  }

  return datum != null && typeof datum === 'object' ? datum : null;
}

export function stampColorCategories(
  plot: SVGSVGElement | HTMLElement,
  options: any,
): void {
  const fieldName: string | undefined = options.__colorCategoryField;
  const data: any[] | undefined =
    options.__seriesHighlightData || options.__customTooltip?.data;
  if (!fieldName) return;

  const allElements = plot.querySelectorAll(MARK_SELECTOR);

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    if (isInsideGridOrAxis(el, plot)) continue;

    // Skip elements that belong to a per-group density overlay — they carry
    // GeoJSON contour __data__ (not row indices) and are handled by the
    // second pass below.
    if (el.closest(`[class*="${DENSITY_CAT_CLASS_PREFIX}"]`)) continue;

    const datum = resolveDatum(el, data);
    if (!datum) continue;

    el.setAttribute('data-cat', encodeCatValue(datum[fieldName]));
  }

  // --- Series-end labels ---
  // Text marks are not in MARK_SELECTOR (they are not fillable data marks), but
  // series-end labels are per-series and must dim/restore with their line.
  const labelEls = plot.querySelectorAll<SVGTextElement>(`g.${SERIES_END_LABEL_CLASS} text`);
  for (let i = 0; i < labelEls.length; i++) {
    const datum = resolveDatum(labelEls[i], data);
    if (!datum) continue;
    labelEls[i].setAttribute('data-cat', encodeCatValue(datum[fieldName]));
  }

  // --- Second pass: stamp density overlay group paths ---
  // Per-group density marks carry a CSS class `density-grp-{base64cat}` (set by
  // density.ts).  Observable Plot applies className to the <g> wrapper, not to
  // individual <path> children — so we must find child elements and stamp them
  // directly so the CSS `path[data-cat="…"]` restore rules can match them.
  const densityEls = plot.querySelectorAll<SVGElement>(`[class*="${DENSITY_CAT_CLASS_PREFIX}"]`);
  for (let i = 0; i < densityEls.length; i++) {
    const el = densityEls[i];
    if (isInsideGridOrAxis(el, plot)) continue;
    const classes = el.getAttribute('class') ?? '';
    const grpClass = classes.split(/\s+/).find(c => c.startsWith(DENSITY_CAT_CLASS_PREFIX));
    if (!grpClass) continue;
    const catValue = decodeDensityCatClass(grpClass.slice(DENSITY_CAT_CLASS_PREFIX.length));

    if (el.tagName.toLowerCase() === 'g') {
      // className landed on the <g> wrapper — stamp every child mark element
      const children = el.querySelectorAll<SVGElement>('path, line, circle, rect');
      for (let j = 0; j < children.length; j++) {
        children[j].setAttribute('data-cat', catValue);
      }
    } else {
      // className is directly on the mark element (Observable Plot version variance)
      el.setAttribute('data-cat', catValue);
    }
  }
}
