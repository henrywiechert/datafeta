// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  buildSymbolPreviewLayout,
  symbolAreaToSideLength,
} from './discreteGridSymbolLayout';

describe('buildSymbolPreviewLayout', () => {
  it('places a single symbol at the cell center with full scale', () => {
    expect(buildSymbolPreviewLayout(1)).toEqual([
      { index: 0, cx: 0.5, cy: 0.5, scale: 1 },
    ]);
  });

  it('arranges 2 symbols on one row in a 2-col grid', () => {
    const placements = buildSymbolPreviewLayout(2);
    expect(placements).toHaveLength(2);
    expect(placements[0].cx).toBeLessThan(placements[1].cx);
    expect(placements[0].cy).toBe(placements[1].cy);
    expect(placements[0].scale).toBeLessThan(1);
  });

  it('arranges 4 symbols in a 2x2 layout', () => {
    const placements = buildSymbolPreviewLayout(4);
    expect(placements).toHaveLength(4);
    const xs = placements.map((p) => p.cx);
    const ys = placements.map((p) => p.cy);
    expect(new Set(xs).size).toBe(2);
    expect(new Set(ys).size).toBe(2);
  });

  it('returns no placements for non-positive counts', () => {
    expect(buildSymbolPreviewLayout(0)).toEqual([]);
    expect(buildSymbolPreviewLayout(-1)).toEqual([]);
  });
});

describe('symbolAreaToSideLength', () => {
  it('returns 0 for non-positive input', () => {
    expect(symbolAreaToSideLength(0)).toBe(0);
    expect(symbolAreaToSideLength(-5)).toBe(0);
  });

  it('returns at least 2 for very small areas', () => {
    expect(symbolAreaToSideLength(0.01)).toBe(2);
  });

  it('approximates the equivalent diameter for a circle area', () => {
    expect(symbolAreaToSideLength(Math.PI * 25)).toBe(10);
  });
});
