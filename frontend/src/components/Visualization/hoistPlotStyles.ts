// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Move the `<style>` elements Plot puts into every plot (and legend) into one
 * shared `<style>` per distinct text in the document head.
 *
 * Attaching a style sheet makes Chrome re-match style rules against the whole
 * document, however few elements the sheet matches: with a dense scatter on
 * screen each axis gutter re-plot during a pan cost ~30–70ms of style recalc
 * for ~140 changed elements. Plot's sheets only hold `:where(.plot-…)` defaults that
 * are identical for every plot, so after the first plot nothing new attaches.
 */

const hoisted = new WeakMap<Document, Set<string>>();

/** Run on the plot before it is attached, so its own sheets never attach. */
export function hoistPlotStyles(plot: Element, doc: Document): void {
  const styles = plot.querySelectorAll('style');
  if (styles.length === 0) return;
  let seen = hoisted.get(doc);
  if (!seen) {
    seen = new Set();
    hoisted.set(doc, seen);
  }
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    const text = style.textContent ?? '';
    if (!seen.has(text)) {
      seen.add(text);
      const shared = doc.createElement('style');
      shared.setAttribute('data-plot-styles', '');
      shared.textContent = text;
      doc.head.appendChild(shared);
    }
    style.remove();
  }
}
