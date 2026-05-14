// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../../types';
import { FacetDataIndex } from '../facetDataIndex';

const rowFacetField: Field = {
  id: 'region',
  columnName: 'region',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const colFacetField: Field = {
  id: 'segment',
  columnName: 'segment',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

describe('FacetDataIndex', () => {
  it('returns exact row, column, and cell subsets', () => {
    const rows = [
      { id: 1, region: 'North', segment: 'Consumer' },
      { id: 2, region: 'North', segment: 'Business' },
      { id: 3, region: 'South', segment: 'Consumer' },
    ];
    const index = new FacetDataIndex(rows, [rowFacetField], [colFacetField]);

    expect(index.getRowRows(['North']).map((row) => row.id)).toEqual([1, 2]);
    expect(index.getColumnRows(['Consumer']).map((row) => row.id)).toEqual([1, 3]);
    expect(index.getCellRows(['North'], ['Consumer']).map((row) => row.id)).toEqual([1]);
    expect(index.getCellRows(['Missing'], ['Consumer'])).toEqual([]);
  });

  it('matches Date facet values by timestamp', () => {
    const dateFacetField: Field = {
      id: 'day',
      columnName: 'day',
      type: 'dimension',
      flavour: 'discrete',
      dataType: 'date',
    };
    const rows = [
      { id: 1, day: new Date('2024-01-01T00:00:00Z') },
      { id: 2, day: new Date('2024-01-02T00:00:00Z') },
    ];
    const index = new FacetDataIndex(rows, [dateFacetField], []);

    expect(index.getRowRows([new Date('2024-01-01T00:00:00Z')]).map((row) => row.id)).toEqual([1]);
  });

  it('preserves existing undefined wildcard filtering semantics', () => {
    const rows = [
      { id: 1, region: 'North' },
      { id: 2, region: 'South' },
      { id: 3, region: undefined },
    ];
    const index = new FacetDataIndex(rows, [rowFacetField], []);

    expect(index.getRowRows([undefined]).map((row) => row.id)).toEqual([1, 2, 3]);
  });
});
