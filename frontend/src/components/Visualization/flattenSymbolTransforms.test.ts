// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { compilePathData, flattenSymbolTransforms, offsetPathData } from './flattenSymbolTransforms';

const SVG_NS = 'http://www.w3.org/2000/svg';

function offset(d: string, dx: number, dy: number): string | null {
  const path = compilePathData(d);
  return path && offsetPathData(path, dx, dy);
}

function dotGroup(paths: Array<{ d: string; transform?: string }>, ariaLabel = 'dot'): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('aria-label', ariaLabel);
  for (const { d, transform } of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    if (transform) p.setAttribute('transform', transform);
    g.appendChild(p);
  }
  return g;
}

describe('offsetPathData', () => {
  it('offsets the end points of arcs but not their radii and flags (d3 circle symbol)', () => {
    expect(offset('M4.5,0A4.5,4.5,0,1,1,-4.5,0A4.5,4.5,0,1,1,4.5,0', 10, 20)).toBe(
      'M14.5,20A4.5,4.5,0,1,1,5.5,20A4.5,4.5,0,1,1,14.5,20',
    );
  });

  it('offsets moveto/lineto pairs and keeps closepath (d3 triangle symbol)', () => {
    expect(offset('M0,-5.333L4.619,2.667L-4.619,2.667Z', 1, 2)).toBe('M1,-3.333L5.619,4.667L-3.619,4.667Z');
  });

  it('leaves relative segments alone (d3 square symbol via rect)', () => {
    expect(offset('M-3,-3h6v6h-6Z', 100, 50)).toBe('M97,47h6v6h-6Z');
  });

  it('offsets every point of curves', () => {
    expect(offset('M0,0C1,2,3,4,5,6Q7,8,9,10', 1, 1)).toBe('M1,1C2,3,4,5,6,7Q8,9,10,11');
  });

  it('rounds sums to the precision Plot draws with', () => {
    expect(offset('M0.1,0.2', 0.2, 0.1)).toBe('M0.3,0.3');
  });

  it('declines path data it cannot offset safely', () => {
    expect(compilePathData('m1,1l2,2')).toBeNull();
    expect(compilePathData('M1-2L3,4')).toBeNull();
    expect(compilePathData(' M1,2')).toBeNull();
    expect(compilePathData('M1,2L3')).toBeNull();
  });
});

describe('flattenSymbolTransforms', () => {
  it('moves dot translations into the path data', () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.appendChild(
      dotGroup([
        { d: 'M0,-5.333L4.619,2.667L-4.619,2.667Z', transform: 'translate(10,20)' },
        { d: 'M0,-5.333L4.619,2.667L-4.619,2.667Z', transform: 'translate(30.5,-1e-1)' },
      ]),
    );
    flattenSymbolTransforms(svg);
    const paths = Array.from(svg.querySelectorAll('path'));
    expect(paths.map((p) => p.getAttribute('d'))).toEqual([
      'M10,14.667L14.619,22.667L5.381,22.667Z',
      'M30.5,-5.433L35.119,2.567L25.881,2.567Z',
    ]);
    expect(paths.every((p) => !p.hasAttribute('transform'))).toBe(true);
  });

  it('keeps transforms it cannot fold into the path: rotations, other marks, odd path data', () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.appendChild(dotGroup([{ d: 'M0,0L1,1', transform: 'translate(1,2) rotate(45)' }]));
    svg.appendChild(dotGroup([{ d: 'M0,0L1,1', transform: 'translate(1,2)' }], 'text'));
    svg.appendChild(dotGroup([{ d: 'm0,0l1,1', transform: 'translate(1,2)' }]));
    flattenSymbolTransforms(svg);
    expect(Array.from(svg.querySelectorAll('path')).map((p) => p.getAttribute('transform'))).toEqual([
      'translate(1,2) rotate(45)',
      'translate(1,2)',
      'translate(1,2)',
    ]);
  });
});
