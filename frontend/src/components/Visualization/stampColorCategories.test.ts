// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { stampColorCategories } from './stampColorCategories';
import { DENSITY_CAT_CLASS_PREFIX, encodeCatForClass } from '../../observable-plot-generator/overlays/density';
import { SERIES_END_LABEL_CLASS } from '../../observable-plot-generator/utils/seriesEndLabels';

// The overlay modules import Observable Plot's untransformed ESM build; no Plot call is reached here.
jest.mock('@observablehq/plot', () => ({}));

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, parent: Element, attrs: Record<string, string> = {}, datum?: unknown) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (datum !== undefined) (node as any).__data__ = datum;
  parent.appendChild(node);
  return node;
}

const data = [{ series: 'a' }, { series: 'b' }, { series: 'c' }];
const options = { __colorCategoryField: 'series', __customTooltip: { data } };

describe('stampColorCategories', () => {
  it('stamps each data mark with the category of the row it is bound to', () => {
    const plot = document.createElementNS(SVG_NS, 'svg');
    const dots = el('g', plot, { 'aria-label': 'dot' });
    const circles = [2, 0, 1].map((row) => el('circle', dots, {}, row));
    // Line marks bind an array of row indices; the first row decides.
    const line = el('path', el('g', plot, { 'aria-label': 'line' }), { stroke: 'red' }, [1, 2]);

    stampColorCategories(plot, options);

    expect(circles.map((c) => c.getAttribute('data-cat'))).toEqual(['c', 'a', 'b']);
    expect(line.getAttribute('data-cat')).toBe('b');
  });

  it('leaves grid, axis and frame groups alone', () => {
    const plot = document.createElementNS(SVG_NS, 'svg');
    const grid = el('line', el('g', plot, { 'aria-label': 'y-grid' }), {}, 0);
    const tick = el('line', el('g', el('g', plot, { 'aria-label': 'x-axis tick' })), {}, 0);
    const frame = el('rect', el('g', plot, { 'aria-label': 'frame' }), {}, 0);
    const dot = el('circle', el('g', plot, { 'aria-label': 'dot' }), {}, 0);

    stampColorCategories(plot, options);

    expect([grid, tick, frame].map((n) => n.hasAttribute('data-cat'))).toEqual([false, false, false]);
    expect(dot.getAttribute('data-cat')).toBe('a');
  });

  it('stamps density overlay paths from their group class, not their contour data', () => {
    const plot = document.createElementNS(SVG_NS, 'svg');
    const group = el('g', plot, { class: `${DENSITY_CAT_CLASS_PREFIX}${encodeCatForClass('b')}` });
    // Contour paths carry GeoJSON data, which must not be read as a row.
    const contour = el('path', group, { fill: 'blue' }, { type: 'MultiPolygon' });

    stampColorCategories(plot, options);

    expect(contour.getAttribute('data-cat')).toBe('b');
  });

  it('stamps series-end labels with their series', () => {
    const plot = document.createElementNS(SVG_NS, 'svg');
    const label = el('text', el('g', plot, { class: SERIES_END_LABEL_CLASS }), {}, 2);

    stampColorCategories(plot, options);

    expect(label.getAttribute('data-cat')).toBe('c');
  });

  it('does nothing without a colour category field', () => {
    const plot = document.createElementNS(SVG_NS, 'svg');
    const dot = el('circle', plot, {}, 0);

    stampColorCategories(plot, { __customTooltip: { data } });

    expect(dot.hasAttribute('data-cat')).toBe(false);
  });
});
