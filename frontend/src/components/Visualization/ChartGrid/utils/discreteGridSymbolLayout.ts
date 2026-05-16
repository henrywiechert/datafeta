// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Layout helpers for the discrete-grid (table-refactor) "symbol" cell kind.
 *
 * Single-symbol cells render the symbol centered. When a cell carries
 * multiple symbols (mixed values within the cell's row/column tuple), they
 * are arranged as a small "preview stack" — a compact 2D arrangement that
 * keeps the visual approximately centered while still showing the spread.
 */

export interface SymbolPreviewPlacement {
  /** Index of the symbol in the source array. */
  index: number;
  /** Center x in normalized cell coordinates [0, 1]. */
  cx: number;
  /** Center y in normalized cell coordinates [0, 1]. */
  cy: number;
  /** Suggested scale factor relative to a single-symbol cell ([0, 1]). */
  scale: number;
}

/**
 * Compute a normalized layout for previewing up to `count` symbols inside a
 * single cell. The output is in fractional cell coordinates so the caller
 * can convert to pixels (or SVG viewBox units) as needed.
 *
 * The arrangement is a square-ish grid; for small counts (<= 4) it forms an
 * aesthetically simple 1x1, 2x1, or 2x2 layout.
 */
export function buildSymbolPreviewLayout(count: number): SymbolPreviewPlacement[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [{ index: 0, cx: 0.5, cy: 0.5, scale: 1 }];
  }

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const scale = Math.min(cellW, cellH) * 0.95;

  const placements: SymbolPreviewPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    placements.push({
      index: i,
      cx: cellW * (c + 0.5),
      cy: cellH * (r + 0.5),
      scale,
    });
  }
  return placements;
}

/**
 * Convert a Plot-style symbol-area size to a side length suitable for an SVG
 * preview. Plot uses area-based sizing (size = π r²); we approximate with a
 * square whose side equals the equivalent diameter.
 */
export function symbolAreaToSideLength(area: number): number {
  if (!Number.isFinite(area) || area <= 0) return 0;
  const radius = Math.sqrt(area / Math.PI);
  return Math.max(2, Math.round(radius * 2));
}
