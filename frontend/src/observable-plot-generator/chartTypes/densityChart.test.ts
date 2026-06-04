// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildDensityOptions } from './densityChart';

jest.mock('@observablehq/plot', () => ({
  line: (data: any[], opts: any) => ({ type: 'line', data, opts }),
  areaY: (data: any[], opts: any) => ({ type: 'areaY', data, opts }),
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
}));

function color(manual = ''): any {
  return { field: null, scheme: '', bias: 0, reversed: false, manual };
}

describe('buildDensityOptions', () => {
  it('builds line/area marks for a smooth 1D KDE curve', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ value: i }));
    const options = buildDensityOptions({
      data: rows,
      valueColumn: 'value',
      valueLabel: 'Value',
      color: color('#336699'),
      densityParams: { bandwidth: 20, thresholds: 10, filled: true, opacity: 0.4 },
    });

    expect(options.x).toEqual(expect.objectContaining({ label: 'Value', grid: true }));
    expect((options.y as any).tickFormat()).toBe('');
    expect(options.marks?.some((m: any) => m.type === 'line')).toBe(true);
    expect(options.marks?.some((m: any) => m.type === 'areaY')).toBe(true);
    expect(options.marks?.some((m: any) => m.type === 'density')).toBe(false);
  });

  it('shows a message when no numeric values are available', () => {
    const options = buildDensityOptions({
      data: [{ value: 'n/a' }],
      valueColumn: 'value',
      valueLabel: 'Value',
    });

    expect(options.marks?.length).toBe(1);
    expect((options.marks![0] as any).type).toBe('text');
  });
});
