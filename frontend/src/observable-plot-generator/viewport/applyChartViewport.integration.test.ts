// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { generatePlot } from '../observablePlotGenerator';
import { ChartGenerationContext } from '../types';
import { Field } from '../../types';
import { getViewportAxes } from './chartViewport';

jest.mock('@observablehq/plot', () => {
  const mark = (type: string) => (data: any, opts: any) => ({ type, data, opts });
  return {
    areaY: mark('areaY'),
    barX: mark('barX'),
    barY: mark('barY'),
    dot: mark('dot'),
    line: mark('line'),
    text: mark('text'),
  };
});

const ts: Field = { id: 'ts', columnName: 'ts', type: 'dimension', flavour: 'continuous', dataType: 'integer' };
const group: Field = { id: 'group', columnName: 'group', type: 'dimension', flavour: 'discrete', dataType: 'string' };
const value: Field = { id: 'value', columnName: 'value', type: 'measure', flavour: 'continuous', dataType: 'float', aggregation: 'sum' };
const duration: Field = { id: 'dur', columnName: 'dur', type: 'measure', flavour: 'continuous', dataType: 'float', aggregation: 'sum' };

const color = { field: null, scheme: '', bias: 0, reversed: false, manual: '' };

function plotCells(result: ReturnType<typeof generatePlot>) {
  return result.cells.filter((c) => c.content.kind === 'plot').map((c) => (c.content as any).options);
}

describe('chart viewport through generatePlot', () => {
  test('faceted line: every cell shows the viewport and shares bounds', () => {
    const rows = [
      { ts: 0, group: 'A', 'SUM(value)': 1 },
      { ts: 50, group: 'A', 'SUM(value)': 2 },
      { ts: 60, group: 'B', 'SUM(value)': 3 },
      { ts: 100, group: 'B', 'SUM(value)': 4 },
    ];
    const context: ChartGenerationContext = {
      xFields: [group, ts],
      yFields: [value],
      color,
      globalChartType: 'line',
      queryResult: { columns: [], rows, row_count: rows.length },
      chartViewport: { ts: { min: 40, max: 70 } },
    };

    const cells = plotCells(generatePlot(context));
    expect(cells.length).toBe(2);
    for (const options of cells) {
      expect(options.x.domain).toEqual([40, 70]);
      expect(getViewportAxes(options)?.x?.bounds).toEqual({ min: -5, max: 105 }); // shared domain incl. 5% padding
    }
  });

  test('gantt: timeline axis shows the viewport', () => {
    const rows = [
      { ts: 0, group: 'A', 'SUM(dur)': 10 },
      { ts: 100, group: 'B', 'SUM(dur)': 10 },
    ];
    const context: ChartGenerationContext = {
      xFields: [ts],
      yFields: [group],
      sizeField: duration,
      color,
      globalChartType: 'gantt',
      queryResult: { columns: [], rows, row_count: rows.length },
      chartViewport: { ts: { min: 20, max: 30 } },
    };

    const [options] = plotCells(generatePlot(context));
    expect(options.x.domainKey).toBe('ts');
    expect(options.x.domain).toEqual([20, 30]);
  });

  test('without a viewport, domains are untouched but bounds are recorded', () => {
    const rows = [
      { ts: 0, group: 'A', 'SUM(value)': 1 },
      { ts: 100, group: 'A', 'SUM(value)': 2 },
    ];
    const context: ChartGenerationContext = {
      xFields: [ts],
      yFields: [value],
      color,
      globalChartType: 'line',
      queryResult: { columns: [], rows, row_count: rows.length },
    };
    const [options] = plotCells(generatePlot(context));
    expect(getViewportAxes(options)?.x?.bounds).toEqual({ min: -5, max: 105 }); // shared domain incl. 5% padding
  });
});
