// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { ganttChart } from './ganttChart';
import { ChartGenerationContext } from '../types';
import { MIN_GANTT_BAR_PX } from '../../config/chartLayoutConfig';

jest.mock('@observablehq/plot', () => ({
  barX: (data: any[], opts: any) => ({ type: 'barX', data, opts }),
  barY: (data: any[], opts: any) => ({ type: 'barY', data, opts }),
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
}));

function makeContext(): ChartGenerationContext {
  return {
    queryResult: {
      rows: [
        { start: 0, duration: 100, task: 'A' },
        { start: 50, duration: 0, task: 'B' },
      ],
      columns: [],
      row_count: 2,
    } as any,
    xFields: [],
    yFields: [],
    color: { field: null, scheme: '', bias: 0, reversed: false, manual: '' },
    sizeField: undefined,
  };
}

/** Run the bar mark's render transform on pixel values and capture what it passes on. */
function runBarRender(orientation: 'x' | 'y', p1: number[], p2: number[]) {
  const { options } = ganttChart(makeContext(), orientation, 'start', 'duration', 'task');
  const bar = (options.marks as any[]).find((m) => m.type === `bar${orientation.toUpperCase()}`);
  const next = jest.fn(() => null);
  const values = { [`${orientation}1`]: p1, [`${orientation}2`]: p2 };
  bar.opts.render(p1.map((_, i) => i), {}, values, {}, {}, next);
  const passed = (next.mock.calls[0] as any[])[2];
  return { v1: Array.from(passed[`${orientation}1`] as number[]), v2: Array.from(passed[`${orientation}2`] as number[]) };
}

describe('ganttChart minimum bar length', () => {
  test('widens sub-pixel bars around their center and leaves long bars alone', () => {
    const { v1, v2 } = runBarRender('x', [10, 50, NaN], [200, 50.2, NaN]);

    expect(v1[0]).toBe(10);
    expect(v2[0]).toBe(200);
    expect(v2[1] - v1[1]).toBeCloseTo(MIN_GANTT_BAR_PX);
    expect((v1[1] + v2[1]) / 2).toBeCloseTo(50.1);
    expect(Number.isNaN(v1[2])).toBe(true);
  });

  test('preserves direction for vertical bars (inverted pixel axis)', () => {
    const { v1, v2 } = runBarRender('y', [100], [99.5]);

    expect(v1[0] - v2[0]).toBeCloseTo(MIN_GANTT_BAR_PX);
    expect(v1[0]).toBeGreaterThan(v2[0]);
  });
});
