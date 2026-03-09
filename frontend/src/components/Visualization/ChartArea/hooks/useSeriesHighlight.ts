import { useEffect, useRef, RefObject } from 'react';

// ---------------------------------------------------------------------------
// Color normalisation (only called for the handful of legend colors)
// ---------------------------------------------------------------------------

const HEX6_RE = /^#[0-9a-f]{6}$/;
const HEX3_RE = /^#[0-9a-f]{3}$/;

function normalizeColor(css: string): string | null {
  const v = css.trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent') return null;
  if (HEX6_RE.test(v)) return v;
  if (HEX3_RE.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

// ---------------------------------------------------------------------------
// CSS generation
// ---------------------------------------------------------------------------

const HL_ATTR = 'data-series-hl';
const HL_SEL = `[${HL_ATTR}]`;

/**
 * Build a stylesheet that dims all data marks except those whose fill/stroke
 * matches one of the highlighted colors.  The browser's CSS engine handles
 * all the per-element matching — no JavaScript iteration required.
 */
function buildHighlightCSS(colors: string[]): string {
  // 1. Dim every fill/stroke-bearing mark inside the container
  const dimSelectors = [
    `${HL_SEL} svg circle[fill]`,
    `${HL_SEL} svg rect[fill]`,
    `${HL_SEL} svg path[fill]:not([fill="none"])`,
    `${HL_SEL} svg path[stroke]:not([stroke="none"])`,
    `${HL_SEL} svg line[stroke]:not([stroke="none"])`,
  ];

  // 2. Restore the highlighted series to full opacity
  const restoreSelectors: string[] = [];
  for (const c of colors) {
    restoreSelectors.push(
      `${HL_SEL} svg circle[fill="${c}"]`,
      `${HL_SEL} svg rect[fill="${c}"]`,
      `${HL_SEL} svg path[fill="${c}"]`,
      `${HL_SEL} svg path[stroke="${c}"]`,
      `${HL_SEL} svg line[stroke="${c}"]`,
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

  return [
    `${dimSelectors.join(',\n')} {\n  opacity: 0.12;\n}`,
    `${hoverSelectors.join(',\n')} {\n  opacity: 0.35;\n}`,
    `${restoreSelectors.join(',\n')} {\n  opacity: 1 !important;\n}`,
    `${protectSelectors.join(',\n')} {\n  opacity: 1 !important;\n}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Dim chart marks whose colour does not match the highlighted set.
 *
 * Instead of iterating over every SVG element in JavaScript, this injects a
 * single `<style>` sheet and sets one data-attribute on the container.  The
 * browser's native CSS engine handles all per-element matching, which is
 * orders of magnitude faster than JS DOM manipulation on large faceted grids.
 */
export function useSeriesHighlight(
  containerRef: RefObject<HTMLDivElement | null>,
  highlightedColors: string[] | null,
  onClear?: () => void,
): void {
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const active = !!(highlightedColors && highlightedColors.length > 0);

  // --- Apply / clear the highlight stylesheet ----------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!active) {
      container.removeAttribute(HL_ATTR);
      if (styleElRef.current) styleElRef.current.textContent = '';
      return;
    }

    const colors = highlightedColors!
      .map(normalizeColor)
      .filter((c): c is string => c !== null);

    if (colors.length === 0) {
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

    styleElRef.current.textContent = buildHighlightCSS(colors);
    container.setAttribute(HL_ATTR, '');
  }, [containerRef, highlightedColors, active]);

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
