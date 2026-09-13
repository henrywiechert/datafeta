// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import FacetZoomDialog from './FacetZoomDialog';
import { GridResultModel } from '../../../observable-plot-generator/gridModel';
import { formatNumericTick } from '../../../observable-plot-generator/utils/numericTickFormat';

const mockReceivedOptions: any[] = [];

jest.mock('../ObservablePlot', () => ({
  __esModule: true,
  default: ({ plotId, options }: { plotId?: string; options?: any }) => {
    mockReceivedOptions.push(options);
    return <div data-testid={`observable-plot-${plotId ?? 'unknown'}`} />;
  },
}));

jest.mock('@observablehq/plot', () => ({
  axisY: (opts: any) => ({ type: 'axisY', opts }),
  axisX: (opts: any) => ({ type: 'axisX', opts }),
}));

function buildGrid(): GridResultModel {
  return {
    cells: [
      {
        id: 'facet-1',
        position: { row: 0, col: 0 },
        metadata: { title: 'West' },
        content: {
          kind: 'plot',
          options: {
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
          } as any,
        },
      },
    ],
    layout: { type: 'grid', columns: 1, rows: 1, columnSizes: ['fr'], rowSizes: ['fr'] },
  };
}

describe('FacetZoomDialog', () => {
  afterEach(() => {
    mockReceivedOptions.length = 0;
    cleanup();
  });

  it('rescales the zoomed cell to this facet and leaves color shared', () => {
    render(<FacetZoomDialog grid={buildGrid()} plotId="facet-1" onClose={() => {}} />);

    expect(mockReceivedOptions).toHaveLength(1);
    const opts = mockReceivedOptions[0];
    expect(opts.x.domain).toEqual(['A', 'C']);
    expect(opts.y.domain).toBeUndefined();
    expect(opts.y.tickFormat).toBe(formatNumericTick);
    expect(opts.color.domain).toEqual([0, 100]);
  });
});
