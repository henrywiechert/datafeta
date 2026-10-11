// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { findNearestEdgeDot, computeGanttMeasurement } from './ganttMeasure';
import { GANTT_EDGE_DOT_START_CLASS, GANTT_EDGE_DOT_END_CLASS } from '../../../../observable-plot-generator/chartTypes/ganttEdgeDotClasses';
import { Field } from '../../../../types';
import { BrushResult } from '../BrushOverlay';

function buildSvgWithEdgeDots(positions: Array<{ cls: string; cx: number }>): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const { cls, cx } of positions) {
    // Matches real Observable Plot output: className lands on the wrapping
    // <g>, NOT on the generated <circle> itself (confirmed via a real-render
    // probe — see repo memory). A test that put the class on the circle
    // directly would pass while the production selector silently matched
    // nothing.
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `${cls} overlay-no-tooltip`);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', '50');
    g.appendChild(circle);
    svg.appendChild(g);
  }
  return svg;
}

describe('findNearestEdgeDot', () => {
  it('returns the closest start/end dot along the given axis', () => {
    const svg = buildSvgWithEdgeDots([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10 },
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 90 },
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 200 },
    ]);

    const nearestToOrigin = findNearestEdgeDot(svg, 'x', 15);
    expect(nearestToOrigin?.getAttribute('cx')).toBe('10');

    const nearestToFar = findNearestEdgeDot(svg, 'x', 205);
    expect(nearestToFar?.getAttribute('cx')).toBe('200');
  });

  it('returns null when there are no edge dots', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(findNearestEdgeDot(svg, 'x', 50)).toBeNull();
  });
});

describe('computeGanttMeasurement', () => {
  const field: Field = {
    id: 'f1',
    columnName: 'start_date',
    type: 'dimension',
    flavour: 'continuous',
    dataType: 'datetime',
  };

  function withScale(svg: SVGSVGElement): SVGSVGElement {
    (svg as any).scale = (axis: 'x' | 'y') =>
      axis === 'x' ? { domain: [0, 1000], range: [0, 100] } : undefined;
    return svg;
  }

  it('returns null for a non-measure gesture', () => {
    const svg = withScale(buildSvgWithEdgeDots([{ cls: GANTT_EDGE_DOT_START_CLASS, cx: 10 }]));
    const brush: BrushResult = { axis: 'x', startPx: 10, endPx: 50, gesture: 'zoom' };
    expect(computeGanttMeasurement(svg, brush, field, undefined)).toBeNull();
  });

  it('snaps to the nearest edge dots and formats the distance', () => {
    const svg = withScale(buildSvgWithEdgeDots([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10 },
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 80 },
    ]));
    const brush: BrushResult = { axis: 'x', startPx: 12, endPx: 78, gesture: 'measure' };

    const result = computeGanttMeasurement(svg, brush, field, undefined);

    expect(result).not.toBeNull();
    expect(result?.snappedStartPx).toBe(10);
    expect(result?.snappedEndPx).toBe(80);
    expect(typeof result?.label).toBe('string');
  });

  it('returns null when no edge dots exist to snap to', () => {
    const svg = withScale(document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement);
    const brush: BrushResult = { axis: 'x', startPx: 10, endPx: 50, gesture: 'measure' };
    expect(computeGanttMeasurement(svg, brush, field, undefined)).toBeNull();
  });
});
