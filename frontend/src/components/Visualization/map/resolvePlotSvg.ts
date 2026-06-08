// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only

/** Observable Plot returns a figure when caption/title/legends are present; pan/zoom needs the inner svg. */
export function resolvePlotSvg(root: SVGSVGElement | HTMLElement): SVGSVGElement | null {
  if (root instanceof SVGSVGElement) return root;
  const svg = root.querySelector('svg');
  return svg instanceof SVGSVGElement ? svg : null;
}
