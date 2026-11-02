// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { generatePlot } from '../../observablePlotGenerator';
import { ChartGenerationContext } from '../../types';
import { Field } from '../../../types';
import { DOMAIN_PAD_RATIO } from '../../../config/chartLayoutConfig';

jest.mock('@observablehq/plot', () => {
  const mark = (type: string) => (data: any, opts: any) => ({ type, data, opts });
  return {
    barX: mark('barX'),
    barY: mark('barY'),
    dot: mark('dot'),
    line: mark('line'),
    text: mark('text'),
  };
});

const measureNames: Field = {
  id: 'mn', columnName: 'MeasureNames', type: 'dimension', flavour: 'discrete', dataType: 'string',
  isSynthetic: true, syntheticType: 'MeasureNames',
};
const measureValues: Field = {
  id: 'mv', columnName: 'MeasureValues', type: 'measure', flavour: 'continuous', dataType: 'float',
  aggregation: 'sum', isSynthetic: true, syntheticType: 'MeasureValues',
};
const runPath: Field = { id: 'rp', columnName: 'run_path', type: 'dimension', flavour: 'discrete', dataType: 'string' };

const color = { field: null, scheme: '', bias: 0, reversed: false, manual: '' };

describe('bar value domain with a tooltip dimension and no color', () => {
  test('covers the stacked total per category, not the largest row', () => {
    // One row per run_path: the bars stack to 8 for num_bt_generated
    const rows = [0, 4, 0, 0, 4].flatMap((v, i) => [
      { run_path: `p${i}`, MeasureNames: 'num_bt_generated', 'SUM(MeasureValues)': v },
      { run_path: `p${i}`, MeasureNames: 'num_bt_bad', 'SUM(MeasureValues)': 0 },
    ]);
    const context: ChartGenerationContext = {
      xFields: [measureNames],
      yFields: [measureValues],
      tooltipFields: [runPath],
      color,
      queryResult: { columns: [], rows, row_count: rows.length },
    };

    const cells = generatePlot(context).cells.filter((c) => c.content.kind === 'plot');
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect((cell.content as any).options.y.domain).toEqual([0, 8 * (1 + DOMAIN_PAD_RATIO)]);
    }
  });
});
