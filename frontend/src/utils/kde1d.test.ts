// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { computeKde1d } from './kde1d';

describe('computeKde1d', () => {
  it('returns a smooth curve peaking near the sample mean', () => {
    const values = Array.from({ length: 200 }, (_, i) => i % 2 === 0 ? 10 + Math.random() : 10.5 + Math.random());
    const curve = computeKde1d(values, { points: 50, bandwidthMultiplier: 1 });

    expect(curve.length).toBe(50);
    const peak = curve.reduce((best, p) => (p.y > best.y ? p : best), curve[0]);
    expect(peak.x).toBeGreaterThan(9);
    expect(peak.x).toBeLessThan(12);
    expect(curve[0].y).toBeGreaterThan(0);
    expect(curve.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('returns empty for no finite values', () => {
    expect(computeKde1d([NaN, Infinity])).toEqual([]);
  });
});
