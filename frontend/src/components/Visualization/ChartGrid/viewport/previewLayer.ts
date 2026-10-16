// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * The element the live pan/zoom preview transforms, and the untransformed
 * box geometry is read from.
 *
 * ObservablePlot renders each plot inside a dedicated layer div marked with
 * PREVIEW_LAYER_ATTR, the only child of its host div. The preview transforms
 * that layer rather than the <svg>: a CSS transform on an <svg> root makes
 * Chrome repaint every mark in it each frame and costs ~5x the layerization
 * of the same transform on an HTML wrapper (measured on a 160-facet scatter).
 */
export const PREVIEW_LAYER_ATTR = 'data-plot-preview-layer';

/**
 * The layer around `svg` if it is the plot root in a marked layer, else the
 * svg itself (e.g. a plot <figure> with a legend, where only the svg moves).
 */
export function previewLayerOf(svg: SVGSVGElement): HTMLElement | SVGSVGElement {
  const parent = svg.parentElement;
  return parent?.hasAttribute(PREVIEW_LAYER_ATTR) ? parent : svg;
}

/**
 * Untransformed box the svg's top-left sits at: the parent of whatever the
 * preview transforms. Its client rect stays put while the preview moves.
 */
export function previewHostOf(svg: SVGSVGElement): Element {
  return previewLayerOf(svg).parentElement ?? svg;
}
