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

    let datum = (el as any).__data__;

    // Observable Plot v0.6.x data binding varies by mark type:
    //  - dot/bar marks: a single index (number) into the data array
    //  - line/area marks: an array of indices (one path per series)
    if (Array.isArray(datum)) {
      const firstIdx = datum[0];
      if (typeof firstIdx === 'number' && data && firstIdx < data.length) {
        datum = data[firstIdx];
      } else if (firstIdx && typeof firstIdx === 'object') {
        // Some marks bind an array of row objects instead of row indices.
        datum = firstIdx;
      } else {
        continue;
      }
    } else if (typeof datum === 'number' && data && datum < data.length) {
      datum = data[datum];
    }
    if (datum == null || typeof datum !== 'object') continue;

    const val = datum[fieldName];
    el.setAttribute('data-cat', encodeCatValue(val));
  }
}
