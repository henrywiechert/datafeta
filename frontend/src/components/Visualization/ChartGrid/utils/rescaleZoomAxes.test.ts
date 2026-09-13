// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { rescaleZoomPlotAxes } from './rescaleZoomAxes';

function options(overrides: Record<string, unknown> = {}) {
  return {
    x: { label: 'cat', type: 'band', domain: ['A', 'B', 'C'] },
    y: { label: 'value', domain: [0, 1000], nice: false },
    color: { type: 'linear', domain: [0, 100] },
    marks: [
      {
        data: [
          { cat: 'A', value: 12 },
          { cat: 'C', value: 8 },
        ],
        channels: {
          x: { value: 'cat' },
          y: { value: 'value' },
        },
      },
    ],
    __customTooltip: {
      data: [
        { cat: 'A', value: 12 },
        { cat: 'C', value: 8 },
      ],
    },
    ...overrides,
  };
}

describe('rescaleZoomPlotAxes', () => {
  it('drops a continuous measure domain so Plot can autoscale this cell', () => {
    const { y } = rescaleZoomPlotAxes(options());
    expect(y.domain).toBeUndefined();
    expect(y.label).toBe('value');
    expect(y.nice).toBe(false);
  });

  it('keeps compact tickFormat when dropping a numeric domain', () => {
    const tickFormat = (d: number) => String(d);
    const { y } = rescaleZoomPlotAxes(options({
      y: { label: 'value', domain: [0, 1000], tickFormat },
    }));
    expect(y.domain).toBeUndefined();
    expect(y.tickFormat).toBe(tickFormat);
  });

  it('filters a band domain to categories present in this cell, preserving order', () => {
    const { x } = rescaleZoomPlotAxes(options());
    expect(x.domain).toEqual(['A', 'C']);
    expect(x.type).toBe('band');
  });

  it('does not use a coincidental value in another column as a category', () => {
    const { x } = rescaleZoomPlotAxes(options({
      x: { type: 'band', domain: ['A', 'B', '12'] },
      marks: [
        {
          data: [{ cat: 'A', value: 12 }],
          channels: { x: { value: 'cat' }, y: { value: 'value' } },
        },
      ],
      __customTooltip: { data: [{ cat: 'A', value: 12 }] },
    }));
    expect(x.domain).toEqual(['A']);
  });

  it('leaves color domain unchanged', () => {
    const input = options();
    const scaled = rescaleZoomPlotAxes(input);
    expect((input as any).color.domain).toEqual([0, 100]);
    expect(scaled).not.toHaveProperty('color');
  });

  it('drops a date pair domain', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const end = new Date('2024-12-31T00:00:00.000Z');
    const { x } = rescaleZoomPlotAxes(options({
      x: { label: 'ts', domain: [start, end], type: 'utc' },
    }));
    expect(x.domain).toBeUndefined();
    expect(x.type).toBe('utc');
  });

  it('keeps heatmap index domains flagged as discrete', () => {
    const domain = [-0.5, 9.5];
    const { x, y } = rescaleZoomPlotAxes(options({
      x: { type: 'linear', domain },
      y: { type: 'linear', domain: [-0.5, 4.5] },
      __discreteAxes: { x: true, y: true },
    }));
    expect(x.domain).toEqual(domain);
    expect(y.domain).toEqual([-0.5, 4.5]);
  });

  it('keeps original domains when the cell has no rows', () => {
    const input = options({
      marks: [],
      __customTooltip: { data: [] },
    });
    const { x, y } = rescaleZoomPlotAxes(input);
    expect(x.domain).toEqual(['A', 'B', 'C']);
    expect(y.domain).toEqual([0, 1000]);
  });

  it('falls back to mark data when tooltip data is absent', () => {
    const { x } = rescaleZoomPlotAxes(options({
      __customTooltip: undefined,
    }));
    expect(x.domain).toEqual(['A', 'C']);
  });

  it('keeps the band domain when filtering would empty it', () => {
    const { x } = rescaleZoomPlotAxes(options({
      __customTooltip: { data: [{ other: 'Z' }] },
      marks: [{ data: [{ other: 'Z' }], channels: { x: { value: 'cat' } } }],
    }));
    expect(x.domain).toEqual(['A', 'B', 'C']);
  });
});
