import { useEffect, useRef, RefObject } from 'react';
import { encodeCatValue } from '../../stampColorCategories';

// ---------------------------------------------------------------------------
// Attribute-based highlight strategy
//
// SVG mark elements are stamped with `data-cat` attributes at render time
// (see stampColorCategories.ts).  This hook builds a CSS sheet that dims all
// data marks except those whose `data-cat` value matches a selected category.
//
// Matching by category value (not fill colour) is critical because the
// palette wraps when there are more categories than colours, so multiple
// categories can share the same colour.
// ---------------------------------------------------------------------------

const HL_ATTR = 'data-series-hl';
const HL_SEL = `[${HL_ATTR}]`;

// ---------------------------------------------------------------------------
// CSS generation
// ---------------------------------------------------------------------------

/** Escape a string for use inside a CSS `[attr="…"]` value. */
function cssEscapeAttrValue(s: string): string {
  // Escape backslashes, double-quotes, and control characters
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\x00-\x1f]/g, (ch) => {
    return '\\' + ch.charCodeAt(0).toString(16) + ' ';
  });
}

function buildHighlightCSS(values: any[]): string {
  // 1. Dim every data mark inside the container
  const dimSelectors = [
    `${HL_SEL} svg circle[fill]`,
    `${HL_SEL} svg rect[fill]`,
    `${HL_SEL} svg path[fill]:not([fill="none"])`,
    `${HL_SEL} svg path[stroke]:not([stroke="none"])`,
    `${HL_SEL} svg line[stroke]:not([stroke="none"])`,
  ];

  // 2. Restore marks that match one of the selected category values
  const restoreSelectors: string[] = [];
  for (const v of values) {
    const encoded = cssEscapeAttrValue(encodeCatValue(v));
    restoreSelectors.push(
      `${HL_SEL} svg circle[data-cat="${encoded}"]`,
      `${HL_SEL} svg rect[data-cat="${encoded}"]`,
      `${HL_SEL} svg path[data-cat="${encoded}"]`,
      `${HL_SEL} svg line[data-cat="${encoded}"]`,
    );
  }

  // 3. Slightly un-dim a mark when the tooltip highlight class is present
  const hoverSelectors = [
    `${HL_SEL} svg circle[fill].chart-mark--highlighted`,
    `${HL_SEL} svg rect[fill].chart-mark--highlighted`,
    `${HL_SEL} svg path.chart-mark--highlighted`,
    `${HL_SEL} svg line.chart-mark--highlighted`,
  ];

  // 4. Never dim grid / axis / frame decoration
  const protectSelectors = [
    `${HL_SEL} svg [aria-label*="grid" i] *`,
    `${HL_SEL} svg [aria-label*="axis" i] *`,
    `${HL_SEL} svg [aria-label*="frame" i] *`,
  ];

  const rules: string[] = [
    `${dimSelectors.join(',\n')} {\n  opacity: 0.04;\n}`,
    `${hoverSelectors.join(',\n')} {\n  opacity: 0.18;\n}`,
  ];

  if (restoreSelectors.length > 0) {
    rules.push(`${restoreSelectors.join(',\n')} {\n  opacity: 1 !important;\n}`);
  }

  rules.push(`${protectSelectors.join(',\n')} {\n  opacity: 1 !important;\n}`);

  return rules.join('\n');
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Dim chart marks whose category value does not match the highlighted set.
 *
 * The heavy lifting is done at render time by `stampColorCategories` which
 * writes `data-cat` attributes on SVG elements.  This hook only needs to
 * inject a CSS stylesheet that targets those attributes — no JavaScript
 * iteration over DOM elements is required at highlight time.
 */
export function useSeriesHighlight(
  containerRef: RefObject<HTMLDivElement | null>,
  highlightedValues: any[] | null,
  colorFieldName: string | null,
  onClear?: () => void,
): void {
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const active = !!(highlightedValues && highlightedValues.length > 0 && colorFieldName);

  // --- Apply / clear the highlight stylesheet ----------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!active) {
      container.removeAttribute(HL_ATTR);
      if (styleElRef.current) styleElRef.current.textContent = '';
      return;
    }

    // Lazily create the <style> element once
    if (!styleElRef.current) {
      styleElRef.current = document.createElement('style');
      styleElRef.current.setAttribute('data-series-highlight', '');
      document.head.appendChild(styleElRef.current);
    }

    styleElRef.current.textContent = buildHighlightCSS(highlightedValues!);
    container.setAttribute(HL_ATTR, '');
  }, [containerRef, highlightedValues, colorFieldName, active]);

  // --- Remove <style> on unmount -----------------------------------------
  useEffect(() => {
    return () => {
      containerRef.current?.removeAttribute(HL_ATTR);
      if (styleElRef.current) {
        styleElRef.current.remove();
        styleElRef.current = null;
      }
    };
  }, [containerRef]);

  // --- Escape key clears the highlight -----------------------------------
  useEffect(() => {
    if (!active || !onClear) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClear();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, onClear]);
}
