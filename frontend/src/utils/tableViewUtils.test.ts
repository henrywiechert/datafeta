// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { prepareTableData, shouldUseTableView } from './tableViewUtils';
import { Field } from '../types';

const dim = (name: string): Field => ({
  id: `dim-${name}`,
  columnName: name,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
});

const measure = (name: string): Field =>
  ({
    id: `m-${name}`,
    columnName: name,
    type: 'measure',
    flavour: 'continuous',
    dataType: 'integer',
    aggregation: 'sum',
  }) as Field;

describe('shouldUseTableView', () => {
  it('returns false when no fields are configured (empty axes)', () => {
    expect(shouldUseTableView([], [])).toBe(false);
  });

  it('returns true (legacy table) for all-discrete shapes when no chart type is picked', () => {
    expect(shouldUseTableView([dim('region')], [dim('segment')])).toBe(true);
  });

  it('returns false when continuous data is present and no chart type is picked', () => {
    expect(shouldUseTableView([dim('region')], [measure('sales')])).toBe(false);
  });

  it.each(['heatmap', 'pie', 'scatter', 'bar', 'tick', 'gantt', 'line', 'cdf', 'table-refactor'] as const)(
    'returns false for explicit chart type %s, even on all-discrete shapes',
    (chartType) => {
      expect(shouldUseTableView([dim('region')], [dim('segment')], chartType)).toBe(false);
    },
  );

  it('still returns true on all-discrete shapes when globalChartType is null/undefined', () => {
    expect(shouldUseTableView([dim('a')], [dim('b')], null)).toBe(true);
    expect(shouldUseTableView([dim('a')], [dim('b')], undefined)).toBe(true);
  });
});

describe('prepareTableData', () => {
  it('handles BigInt dimension values in legacy table grouping', () => {
    const idField = {
      ...dim('trip_id'),
      dataType: 'integer',
    } as Field;
    const queryResult = {
      rows: [
        { trip_id: BigInt('9007199254740993') },
        { trip_id: BigInt('9007199254740993') },
        { trip_id: BigInt('9007199254740995') },
      ],
    };

    const tableData = prepareTableData(queryResult, [], [idField]);

    expect(tableData.rows).toHaveLength(2);
    expect(tableData.rows[0].trip_id).toBe(BigInt('9007199254740993'));
    expect(tableData.rows[1].trip_id).toBe(BigInt('9007199254740995'));
  });
});
