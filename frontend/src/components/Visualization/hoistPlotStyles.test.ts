// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { hoistPlotStyles } from './hoistPlotStyles';

const SVG_NS = 'http://www.w3.org/2000/svg';

function plotWithStyle(css: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = css;
  svg.appendChild(style);
  svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  return svg;
}

const sharedStyles = (doc: Document) =>
  Array.from(doc.head.querySelectorAll('style[data-plot-styles]')).map((s) => s.textContent);

describe('hoistPlotStyles', () => {
  it('moves each distinct plot style sheet into the head once', () => {
    const doc = document.implementation.createHTMLDocument('');
    const plots = [plotWithStyle(':where(.plot-a) { display: block; }'), plotWithStyle(':where(.plot-a) { display: block; }')];
    const legend = plotWithStyle(':where(.plot-a-swatches) { font-size: 10px; }');
    for (const plot of [...plots, legend]) hoistPlotStyles(plot, doc);

    expect(sharedStyles(doc)).toEqual([':where(.plot-a) { display: block; }', ':where(.plot-a-swatches) { font-size: 10px; }']);
    for (const plot of [...plots, legend]) {
      expect(plot.querySelector('style')).toBeNull();
      expect(plot.querySelector('g')).not.toBeNull();
    }
  });

  it('tracks each document separately', () => {
    const a = document.implementation.createHTMLDocument('');
    const b = document.implementation.createHTMLDocument('');
    hoistPlotStyles(plotWithStyle('x {}'), a);
    hoistPlotStyles(plotWithStyle('x {}'), b);
    expect(sharedStyles(a)).toEqual(['x {}']);
    expect(sharedStyles(b)).toEqual(['x {}']);
  });
});
