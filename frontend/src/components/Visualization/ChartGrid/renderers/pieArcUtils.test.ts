// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildPieArcSegments, describePieArc } from './pieArcUtils';

describe('pieArcUtils', () => {
  test('creates a full-circle path as two SVG arcs', () => {
    const path = describePieArc({
      startAngle: -Math.PI / 2,
      endAngle: -Math.PI / 2 + Math.PI * 2,
      radius: 50,
      cx: 60,
      cy: 60,
    });

    expect(path).toContain('A 50 50 0 1 1');
    expect(path.match(/A 50 50/g)).toHaveLength(2);
    expect(path.endsWith('Z')).toBe(true);
  });

  test('builds proportional arc segments and skips empty totals', () => {
    const segments = buildPieArcSegments({
      values: [1, 3],
      radius: 40,
      cx: 50,
      cy: 50,
    });

    expect(segments).toHaveLength(2);
    expect(segments[0].endAngle - segments[0].startAngle).toBeCloseTo(Math.PI / 2);
    expect(segments[1].endAngle - segments[1].startAngle).toBeCloseTo(Math.PI * 1.5);
    expect(buildPieArcSegments({ values: [0, -1], radius: 40, cx: 50, cy: 50 })).toEqual([]);
  });
});
