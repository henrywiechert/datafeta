// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildEdgePositions, snapWithinRow, getRowLockThresholdPx, computeMeasurementFromPoints } from './ganttMeasure';
import { GANTT_EDGE_DOT_START_CLASS, GANTT_EDGE_DOT_END_CLASS } from '../../../../observable-plot-generator/chartTypes/ganttEdgeDotClasses';
import { Field } from '../../../../types';

function buildSvgWithEdgeDots(positions: Array<{ cls: string; cx: number; cy: number }>): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const { cls, cx, cy } of positions) {
    // Matches real Observable Plot output: className lands on the wrapping
    // <g>, NOT on the generated <circle> itself (confirmed via a real-render
    // probe — see repo memory). A test that put the class on the circle
    // directly would pass while the production selector silently matched
    // nothing.
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `${cls} overlay-no-tooltip`);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    g.appendChild(circle);
    svg.appendChild(g);
  }
  return svg;
}

describe('buildEdgePositions', () => {
  it('returns {measurePx, rowPx} for every edge dot along the given axis', () => {
    const svg = buildSvgWithEdgeDots([
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 10, cy: 50 },
      { cls: GANTT_EDGE_DOT_END_CLASS, cx: 90, cy: 50 },
      { cls: GANTT_EDGE_DOT_START_CLASS, cx: 20, cy: 150 },
    ]);

    expect(buildEdgePositions(svg, 'x')).toEqual([
      { measurePx: 10, rowPx: 50 },
      { measurePx: 90, rowPx: 50 },
      { measurePx: 20, rowPx: 150 },
    ]);
  });

  it('returns an empty array when there are no edge dots', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(buildEdgePositions(svg, 'x')).toEqual([]);
  });
});

describe('getRowLockThresholdPx', () => {
  it('uses half the category scale step when available', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    (svg as any).scale = (axis: 'x' | 'y') => (axis === 'y' ? { step: 40 } : undefined);
    expect(getRowLockThresholdPx(svg, 'x')).toBe(20);
  });

  it('falls back to a default when step is unavailable', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    (svg as any).scale = () => undefined;
    expect(getRowLockThresholdPx(svg, 'x')).toBeGreaterThan(0);
  });
});

describe('snapWithinRow', () => {
  // Two rows: row A at rowPx=50 (dots at measurePx 10, 90), row B at rowPx=150 (dot at measurePx 20).
  const positions = [
    { measurePx: 10, rowPx: 50 },
    { measurePx: 90, rowPx: 50 },
    { measurePx: 20, rowPx: 150 },
  ];
  const ROW_THRESHOLD = 30;

  it('snaps to the nearest edge dot within the pointer\'s own row', () => {
    const result = snapWithinRow(positions, 15, 50, ROW_THRESHOLD);
    expect(result).toEqual({ px: 10, snapped: true });
  });

  it('does not snap to a dot in a different row even if horizontally closer', () => {
    // Pointer is in row A (rowPx=50) at measurePx=19 — numerically closest dot
    // overall is row B's dot at 20, but that must never be considered.
    const result = snapWithinRow(positions, 19, 50, ROW_THRESHOLD);
    expect(result.px).toBe(10); // nearest dot WITHIN row A, not row B's 20
  });

  it('is free-floating (raw position) when not close enough to any row', () => {
    const result = snapWithinRow(positions, 15, 500, ROW_THRESHOLD);
    expect(result).toEqual({ px: 15, snapped: false });
  });

  it('is free-floating when in a row but too far from any edge in it', () => {
    const result = snapWithinRow(positions, 50, 50, ROW_THRESHOLD); // 50 is 40px from the nearer dot (10), beyond SNAP_DISTANCE_PX
    expect(result).toEqual({ px: 50, snapped: false });
  });

  it('returns free-floating for an empty index', () => {
    expect(snapWithinRow([], 15, 50, ROW_THRESHOLD)).toEqual({ px: 15, snapped: false });
  });
});

describe('computeMeasurementFromPoints', () => {
  const field: Field = {
    id: 'f1',
    columnName: 'start_date',
    type: 'dimension',
    flavour: 'continuous',
    dataType: 'datetime',
  };

  function fakePlotElement(scale: any): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    (svg as any).scale = (axis: 'x' | 'y') => (axis === 'x' ? scale : undefined);
    return svg;
  }

  it('orders left/right by pixel position and carries each side\'s own snapped flag', () => {
    const el = fakePlotElement({ domain: [0, 1000], range: [0, 100] });
    const result = computeMeasurementFromPoints(
      el, 'x',
      { px: 80, snapped: false }, // this point is numerically larger...
      { px: 10, snapped: true },  // ...so it must end up on the right, keeping ITS OWN flag
      field,
    );

    expect(result?.leftPx).toBe(10);
    expect(result?.leftSnapped).toBe(true);
    expect(result?.rightPx).toBe(80);
    expect(result?.rightSnapped).toBe(false);
    expect(typeof result?.label).toBe('string');
  });

  it('returns null when the plot element has no scale() accessor', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(computeMeasurementFromPoints(svg, 'x', { px: 10, snapped: true }, { px: 80, snapped: true }, field)).toBeNull();
  });

  it('returns null when scale() returns an incomplete descriptor', () => {
    const el = fakePlotElement(undefined);
    expect(computeMeasurementFromPoints(el, 'x', { px: 10, snapped: true }, { px: 80, snapped: true }, field)).toBeNull();
  });
});

