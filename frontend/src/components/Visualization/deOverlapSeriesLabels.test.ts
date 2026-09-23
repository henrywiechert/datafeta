// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * The de-overlap pass works on rendered SVG, so these tests build the DOM that
 * Observable Plot produces: one `<text transform="translate(x,y)">` per label
 * (that transform is the *only* thing positioning it) and a `getBBox()` that,
 * like the real one, reports the box in the element's own coordinate system
 * and therefore knows nothing about the translate.
 */
import { deOverlapSeriesLabels } from './deOverlapSeriesLabels';
import {
  SERIES_END_LABEL_CLASS,
  SERIES_END_LABEL_DODGE_X_CLASS,
  SERIES_END_LABEL_DODGE_Y_CLASS,
  SERIES_END_LABEL_LEADER_CLASS,
  SERIES_END_LABEL_LEADER_INDENT_PX,
} from '../../observable-plot-generator/utils/seriesEndLabels';

// The class-name constants live beside the label mark factory, which imports
// Plot (ESM, untransformed by CRA's jest config). Only the constants matter
// here; jest hoists this above the imports.
jest.mock('@observablehq/plot', () => ({ text: () => ({}) }));

const SVG_NS = 'http://www.w3.org/2000/svg';

const LABEL_HEIGHT = 12;
const LABEL_WIDTH = 40;

type Placed = { text: string; x: number; y: number };

function buildPlot(
  labels: Placed[],
  opts: { axis: 'x' | 'y'; frameWidth?: number; frameHeight?: number; groupTransform?: string } = { axis: 'y' },
): { svg: SVGSVGElement; group: SVGGElement; texts: SVGTextElement[] } {
  const { axis, frameWidth = 600, frameHeight = 400, groupTransform } = opts;
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  Object.defineProperty(svg, 'width', { value: { baseVal: { value: frameWidth } }, configurable: true });
  Object.defineProperty(svg, 'height', { value: { baseVal: { value: frameHeight } }, configurable: true });

  const group = document.createElementNS(SVG_NS, 'g');
  const dodge = axis === 'y' ? SERIES_END_LABEL_DODGE_Y_CLASS : SERIES_END_LABEL_DODGE_X_CLASS;
  group.setAttribute('class', `${SERIES_END_LABEL_CLASS} ${dodge}`);
  // Plot applies the mark's dx/dy to the group, not to each text.
  if (groupTransform) group.setAttribute('transform', groupTransform);
  Object.defineProperty(group, 'ownerSVGElement', { value: svg });
  svg.appendChild(group);

  const texts = labels.map(({ text, x, y }) => {
    const el = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    el.textContent = text;
    el.setAttribute('transform', `translate(${x},${y})`);
    // Mirrors Plot: the glyph box sits just above the text origin. Like the
    // real getBBox, a hidden element measures as empty.
    (el as any).getBBox = () =>
      el.style.display === 'none'
        ? { x: 0, y: 0, width: 0, height: 0 }
        : { x: 0, y: -LABEL_HEIGHT * 0.75, width: LABEL_WIDTH, height: LABEL_HEIGHT };
    group.appendChild(el);
    return el;
  });

  return { svg, group: group as SVGGElement, texts };
}

function leadersOf(group: SVGGElement): SVGLineElement[] {
  return Array.from(group.querySelectorAll<SVGLineElement>(`line.${SERIES_END_LABEL_LEADER_CLASS}`));
}

/** The translate currently on the element, which is its rendered position. */
function translateOf(el: SVGTextElement): { x: number; y: number } {
  const m = /translate\(\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)\s*\)/.exec(el.getAttribute('transform') ?? '');
  if (!m) throw new Error(`label lost its transform: ${el.textContent}`);
  return { x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) };
}

describe('deOverlapSeriesLabels', () => {
  test('keeps well-separated labels exactly where Plot put them', () => {
    const { svg, texts } = buildPlot([
      { text: 'Alpha', x: 500, y: 100 },
      { text: 'Bravo', x: 500, y: 200 },
      { text: 'Charlie', x: 500, y: 300 },
    ]);

    deOverlapSeriesLabels(svg);

    expect(texts.map(translateOf)).toEqual([
      { x: 500, y: 100 },
      { x: 500, y: 200 },
      { x: 500, y: 300 },
    ]);
  });

  // Regression: the pass used to clear the transform before measuring, which
  // dropped every label onto the mark group's origin (the plot's top-left).
  test('never moves a label to the origin', () => {
    const { svg, texts } = buildPlot([
      { text: 'Alpha', x: 500, y: 180 },
      { text: 'Bravo', x: 500, y: 184 },
      { text: 'Charlie', x: 500, y: 188 },
    ]);

    deOverlapSeriesLabels(svg);

    for (const el of texts) {
      const { x, y } = translateOf(el);
      expect(x).toBe(500);
      expect(y).toBeGreaterThan(100);
    }
  });

  test('separates a tight cluster without dragging it away from its lines', () => {
    const anchors = [180, 184, 188];
    const { svg, texts } = buildPlot(anchors.map((y, i) => ({ text: `S${i}`, x: 500, y })));

    deOverlapSeriesLabels(svg);

    const ys = texts.map((el) => translateOf(el).y);

    // Every pair clears the other.
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(LABEL_HEIGHT);
    }
    // ...and the stack stays next to the cluster it came from.
    for (let i = 0; i < ys.length; i += 1) {
      expect(Math.abs(ys[i] - anchors[i])).toBeLessThan(3 * LABEL_HEIGHT);
    }
  });

  test('pulls back only the labels that overflow the bottom edge', () => {
    // Cluster hard against the bottom of a 400px frame.
    const { svg, texts } = buildPlot(
      [396, 398, 399].map((y, i) => ({ text: `S${i}`, x: 500, y })),
      { axis: 'y', frameHeight: 400 },
    );

    deOverlapSeriesLabels(svg);

    const ys = texts.map((el) => translateOf(el).y);
    for (const y of ys) {
      expect(y).toBeLessThanOrEqual(400);
    }
    // The old implementation shifted the whole stack by the overflow, which
    // pushed the cluster far up the frame; the labels should stay near 400.
    expect(Math.min(...ys)).toBeGreaterThan(340);
  });

  test('hides the labels the axis cannot fit and keeps the rest legible', () => {
    // 40 labels of 12px cannot all fit a 100px frame.
    const anchors = Array.from({ length: 40 }, (_, i) => 50 + i);
    const { svg, texts } = buildPlot(
      anchors.map((y, i) => ({ text: `S${i}`, x: 500, y })),
      { axis: 'y', frameHeight: 100 },
    );

    deOverlapSeriesLabels(svg);

    const visible = texts.filter((el) => el.style.display !== 'none');
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(texts.length);

    // Whatever survives must not overlap.
    const ys = visible.map((el) => translateOf(el).y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(LABEL_HEIGHT);
    }
  });

  test('re-reveals a hidden label when the plot has room again', () => {
    const anchors = Array.from({ length: 20 }, (_, i) => 50 + i);
    const { svg, texts } = buildPlot(
      anchors.map((y, i) => ({ text: `S${i}`, x: 500, y })),
      { axis: 'y', frameHeight: 100 },
    );

    deOverlapSeriesLabels(svg);
    expect(texts.some((el) => el.style.display === 'none')).toBe(true);

    // Same labels, generous frame: nothing should stay hidden.
    Object.defineProperty(svg, 'height', { value: { baseVal: { value: 4000 } }, configurable: true });
    deOverlapSeriesLabels(svg);

    expect(texts.every((el) => el.style.display !== 'none')).toBe(true);
  });

  test('dodges horizontally for vertical charts and leaves y alone', () => {
    const { svg, texts } = buildPlot(
      [{ text: 'Alpha', x: 200, y: 90 }, { text: 'Bravo', x: 210, y: 90 }],
      { axis: 'x', frameWidth: 600 },
    );

    deOverlapSeriesLabels(svg);

    const placed = texts.map(translateOf);
    expect(placed.every((p) => p.y === 90)).toBe(true);
    expect(placed[1].x - placed[0].x).toBeGreaterThanOrEqual(LABEL_WIDTH);
  });

  test('is idempotent across repeated passes', () => {
    const { svg, texts } = buildPlot([
      { text: 'Alpha', x: 500, y: 180 },
      { text: 'Bravo', x: 500, y: 184 },
      { text: 'Charlie', x: 500, y: 188 },
    ]);

    deOverlapSeriesLabels(svg);
    const first = texts.map(translateOf);
    deOverlapSeriesLabels(svg);
    deOverlapSeriesLabels(svg);

    expect(texts.map(translateOf)).toEqual(first);
  });

  test('preserves a rotate that follows the translate', () => {
    const { svg, texts } = buildPlot([{ text: 'Alpha', x: 500, y: 100 }, { text: 'Bravo', x: 500, y: 104 }]);
    texts.forEach((el) => el.setAttribute('transform', `${el.getAttribute('transform')} rotate(30)`));

    deOverlapSeriesLabels(svg);

    for (const el of texts) {
      expect(el.getAttribute('transform')).toContain('rotate(30)');
    }
  });

  test('centres a crowded cluster on its lines instead of stacking one way', () => {
    const anchors = [200, 200, 200, 200, 200];
    const { svg, texts } = buildPlot(anchors.map((y, i) => ({ text: `S${i}`, x: 500, y })));

    deOverlapSeriesLabels(svg);

    const ys = texts.map((el) => translateOf(el).y);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    expect(Math.abs(mean - 200)).toBeLessThan(1);
    expect(Math.min(...ys)).toBeLessThan(200);
    expect(Math.max(...ys)).toBeGreaterThan(200);
  });

  test('draws leader lines from the line ends to a displaced cluster', () => {
    // dx = 6: labels sit to the right of their line ends.
    const { svg, group, texts } = buildPlot(
      [{ text: 'Alpha', x: 500, y: 200 }, { text: 'Bravo', x: 500, y: 202 }],
      { axis: 'y', groupTransform: 'translate(6,0)' },
    );
    texts[0].setAttribute('fill', '#ff0000');
    texts[0].setAttribute('data-cat', 'alpha');

    deOverlapSeriesLabels(svg);

    const leaders = leadersOf(group);
    expect(leaders).toHaveLength(2);
    // The labels move further out to make room for the leaders.
    for (const el of texts) expect(translateOf(el).x).toBe(500 + SERIES_END_LABEL_LEADER_INDENT_PX);

    const alpha = leaders.find((l) => l.getAttribute('data-cat') === 'alpha')!;
    expect(alpha.getAttribute('stroke')).toBe('#ff0000');
    // Starts just past the line end (anchor minus the group's dx)...
    expect(Number(alpha.getAttribute('x1'))).toBeCloseTo(500 - 6 + 2);
    expect(Number(alpha.getAttribute('y1'))).toBeCloseTo(200);
    // ...and ends just before the label's left edge.
    expect(Number(alpha.getAttribute('x2'))).toBeCloseTo(500 + SERIES_END_LABEL_LEADER_INDENT_PX - 2);
  });

  test('draws no leaders when nothing had to move', () => {
    const { svg, group, texts } = buildPlot(
      [{ text: 'Alpha', x: 500, y: 100 }, { text: 'Bravo', x: 500, y: 300 }],
      { axis: 'y', groupTransform: 'translate(6,0)' },
    );

    deOverlapSeriesLabels(svg);

    expect(leadersOf(group)).toHaveLength(0);
    expect(texts.map(translateOf)).toEqual([{ x: 500, y: 100 }, { x: 500, y: 300 }]);
  });

  test('does not accumulate leaders across repeated passes', () => {
    const { svg, group } = buildPlot(
      [{ text: 'Alpha', x: 500, y: 200 }, { text: 'Bravo', x: 500, y: 202 }],
      { axis: 'y', groupTransform: 'translate(6,0)' },
    );

    deOverlapSeriesLabels(svg);
    deOverlapSeriesLabels(svg);

    expect(leadersOf(group)).toHaveLength(2);
  });

  test('drops the lowest-priority labels (last in DOM order), not the top ones', () => {
    // Anchors run bottom-to-top, so position and priority disagree.
    const anchors = Array.from({ length: 20 }, (_, i) => 90 - i);
    const { svg, texts } = buildPlot(
      anchors.map((y, i) => ({ text: `S${i}`, x: 500, y })),
      { axis: 'y', frameHeight: 100 },
    );

    deOverlapSeriesLabels(svg);

    const hidden = texts.map((el) => el.style.display === 'none');
    const firstHidden = hidden.indexOf(true);
    expect(firstHidden).toBeGreaterThan(0);
    expect(hidden.slice(0, firstHidden).every((h) => !h)).toBe(true);
    expect(hidden.slice(firstHidden).every((h) => h)).toBe(true);
  });

  test('does nothing when the plot has no series-end labels', () => {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    expect(() => deOverlapSeriesLabels(svg)).not.toThrow();
  });
});
