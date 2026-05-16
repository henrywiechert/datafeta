// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { resolvePlotResizePolicy } from './plotResizePolicy';
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import { Field, FieldOverrideState } from '../../../../types';

function field(
  id: string,
  type: Field['type'],
  flavour: Field['flavour'],
): Field {
  return {
    id,
    columnName: id,
    displayName: id,
    type,
    flavour,
    source: 'column',
    dataType: flavour === 'continuous' || type === 'measure' ? 'number' : 'string',
  } as Field;
}

function buildGrid(xField?: Field, yField?: Field): GridResultModel {
  return {
    cells: [
      {
        id: 'cell-0-0',
        position: { row: 0, col: 0 },
        content: { kind: 'plot', options: {} as any },
        metadata: { xField, yField },
      },
    ],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: [100],
      rowSizes: [100],
    },
  };
}

describe('resolvePlotResizePolicy', () => {
  it('disables row resizing for horizontal auto bar charts', () => {
    const policy = resolvePlotResizePolicy(
      buildGrid(field('sales', 'measure', 'continuous'), field('region', 'dimension', 'discrete')),
    );

    expect(policy).toEqual({ allowColumnResize: true, allowRowResize: false });
  });

  it('disables column resizing for vertical explicit bar charts', () => {
    const policy = resolvePlotResizePolicy(
      buildGrid(field('region', 'dimension', 'discrete'), field('sales', 'measure', 'continuous')),
      {},
      'bar',
      'tick-strip',
    );

    expect(policy).toEqual({ allowColumnResize: false, allowRowResize: true });
  });

  it('disables row resizing for horizontal box plots', () => {
    const policy = resolvePlotResizePolicy(
      buildGrid(field('duration', 'dimension', 'continuous'), field('team', 'dimension', 'discrete')),
      {},
      'tick',
      'box-plot',
    );

    expect(policy).toEqual({ allowColumnResize: true, allowRowResize: false });
  });

  it('respects per-field chart overrides when resolving resize direction', () => {
    const xField = field('duration', 'dimension', 'continuous');
    const yField = field('team', 'dimension', 'discrete');
    const fieldOverrides: Record<string, FieldOverrideState> = {
      [yField.id]: { chartType: 'tick' } as FieldOverrideState,
    };

    const policy = resolvePlotResizePolicy(
      buildGrid(xField, yField),
      fieldOverrides,
      null,
      'box-plot',
    );

    expect(policy).toEqual({ allowColumnResize: true, allowRowResize: false });
  });
});
