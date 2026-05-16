// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildHierarchicalHeaderSegments } from './hierarchicalHeaderUtils';

describe('buildHierarchicalHeaderSegments', () => {
  it('returns one segment per tuple at the innermost level', () => {
    const tuples = [
      ['East', 2024],
      ['East', 2025],
      ['West', 2024],
    ];

    const segments = buildHierarchicalHeaderSegments(tuples, 1, 1);

    expect(segments).toEqual([
      { value: 2024, startIndex: 1, span: 1, firstTupleIndex: 0 },
      { value: 2025, startIndex: 2, span: 1, firstTupleIndex: 1 },
      { value: 2024, startIndex: 3, span: 1, firstTupleIndex: 2 },
    ]);
  });

  it('merges consecutive tuples sharing the prefix at outer levels', () => {
    const tuples = [
      ['East', 2024],
      ['East', 2025],
      ['West', 2024],
    ];

    const segments = buildHierarchicalHeaderSegments(tuples, 0, 1);

    expect(segments).toEqual([
      { value: 'East', startIndex: 1, span: 2, firstTupleIndex: 0 },
      { value: 'West', startIndex: 3, span: 1, firstTupleIndex: 2 },
    ]);
  });

  it('multiplies spans by baseSpan', () => {
    const tuples = [['A'], ['A'], ['B']];

    const segments = buildHierarchicalHeaderSegments(tuples, 0, 4);

    expect(segments).toEqual([
      { value: 'A', startIndex: 1, span: 8, firstTupleIndex: 0 },
      { value: 'B', startIndex: 9, span: 4, firstTupleIndex: 2 },
    ]);
  });

  it('honors firstTrack offset for column-grid placement', () => {
    const tuples = [['A'], ['B']];

    const segments = buildHierarchicalHeaderSegments(tuples, 0, 1, 5);

    expect(segments).toEqual([
      { value: 'A', startIndex: 5, span: 1, firstTupleIndex: 0 },
      { value: 'B', startIndex: 6, span: 1, firstTupleIndex: 1 },
    ]);
  });

  it('does not merge across a parent boundary even when the child value matches', () => {
    const tuples = [
      ['East', 2024],
      ['West', 2024],
    ];

    const segments = buildHierarchicalHeaderSegments(tuples, 1, 1);

    expect(segments).toEqual([
      { value: 2024, startIndex: 1, span: 1, firstTupleIndex: 0 },
      { value: 2024, startIndex: 2, span: 1, firstTupleIndex: 1 },
    ]);
  });

  it('treats Dates with the same timestamp as equal for prefix matching', () => {
    const d = new Date('2024-01-01');
    const e = new Date('2024-01-01');
    const f = new Date('2025-01-01');
    const tuples = [
      [d, 'a'],
      [e, 'b'],
      [f, 'c'],
    ];

    const segments = buildHierarchicalHeaderSegments(tuples, 0, 1);

    expect(segments).toHaveLength(2);
    expect(segments[0].span).toBe(2);
    expect(segments[1].span).toBe(1);
  });

  it('returns no segments for empty input', () => {
    expect(buildHierarchicalHeaderSegments([], 0, 1)).toEqual([]);
  });
});
