// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { clampToBounds, minSpanFor, panBy, zoomAt } from './viewportMath';

const bounds = { min: 0, max: 100 };

describe('zoomAt', () => {
  test('keeps the anchor at the same relative position', () => {
    const next = zoomAt({ min: 0, max: 100 }, 25, 0.5, bounds, 0.001)!;
    expect(next.max - next.min).toBeCloseTo(50);
    expect((25 - next.min) / (next.max - next.min)).toBeCloseTo(0.25);
  });

  test('returns null when zooming out to (or past) the bounds', () => {
    expect(zoomAt({ min: 20, max: 60 }, 40, 3, bounds, 0.001)).toBeNull();
  });

  test('never zooms below the minimum span', () => {
    const next = zoomAt({ min: 10, max: 11 }, 10.5, 0.0001, bounds, 0.5)!;
    expect(next.max - next.min).toBeCloseTo(0.5);
  });

  test('shifts back inside the bounds when zooming out near an edge', () => {
    const next = zoomAt({ min: 0, max: 20 }, 0, 2, bounds, 0.001)!;
    expect(next).toEqual({ min: 0, max: 40 });
    const nearEnd = zoomAt({ min: 80, max: 100 }, 85, 2, bounds, 0.001)!;
    expect(nearEnd.max).toBe(100);
    expect(nearEnd.max - nearEnd.min).toBeCloseTo(40);
  });
});

describe('panBy / clampToBounds', () => {
  test('pans and stops at the bounds without changing the span', () => {
    expect(panBy({ min: 10, max: 30 }, 5, bounds)).toEqual({ min: 15, max: 35 });
    expect(panBy({ min: 10, max: 30 }, -50, bounds)).toEqual({ min: 0, max: 20 });
    expect(panBy({ min: 70, max: 90 }, 50, bounds)).toEqual({ min: 80, max: 100 });
  });

  test('a range covering the bounds means the natural view', () => {
    expect(clampToBounds({ min: -10, max: 120 }, bounds)).toBeNull();
  });
});

describe('minSpanFor', () => {
  test('is 1 ms on time axes and relative otherwise', () => {
    expect(minSpanFor({ min: 0, max: 1000 }, true)).toBe(1);
    expect(minSpanFor({ min: 0, max: 1000 }, false)).toBeCloseTo(0.001);
  });
});
