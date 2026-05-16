// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Utilities for rendering hierarchical (multi-level) facet headers.
 *
 * Given an ordered list of facet value tuples and a base span (cells per
 * tuple along the header axis), produce per-level segments where consecutive
 * tuples sharing the same prefix are merged into a single span. This matches
 * Tableau-style hierarchical headers and works correctly for sparse facet
 * spaces where the full Cartesian product is not present.
 */
export interface HierarchicalHeaderSegment {
  /** Value at the level being rendered. */
  value: any;
  /** Track index where this segment starts (1-based, for CSS grid). */
  startIndex: number;
  /** Number of tracks this segment spans. */
  span: number;
  /** Index of the first tuple covered by this segment (for stable React keys). */
  firstTupleIndex: number;
}

function tuplePrefixEquals(a: any[], b: any[], depth: number): boolean {
  for (let i = 0; i <= depth; i++) {
    const av = a[i];
    const bv = b[i];
    if (av instanceof Date && bv instanceof Date) {
      if (av.getTime() !== bv.getTime()) return false;
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}

/**
 * Build segments for a single header level.
 *
 * Two consecutive tuples merge into one segment iff they share the same
 * value at every level from 0 up to and including `levelIdx`. The innermost
 * level therefore generally produces one segment per tuple; outer levels
 * produce one segment per parent group.
 *
 * @param orderedTuples - Ordered list of facet value tuples.
 * @param levelIdx - Level (column index in each tuple) to render.
 * @param baseSpan - Number of cell tracks contributed by each tuple.
 * @param firstTrack - 1-based offset of the first cell track on this header axis.
 */
export function buildHierarchicalHeaderSegments(
  orderedTuples: any[][],
  levelIdx: number,
  baseSpan: number,
  firstTrack: number = 1,
): HierarchicalHeaderSegment[] {
  if (!orderedTuples || orderedTuples.length === 0) return [];

  const segments: HierarchicalHeaderSegment[] = [];
  const safeBase = Math.max(1, baseSpan);
  let segmentStart = 0;
  for (let i = 0; i < orderedTuples.length; i++) {
    const isLast = i === orderedTuples.length - 1;
    const breakHere =
      isLast || !tuplePrefixEquals(orderedTuples[i], orderedTuples[i + 1], levelIdx);

    if (breakHere) {
      const length = i - segmentStart + 1;
      segments.push({
        value: orderedTuples[i][levelIdx],
        startIndex: firstTrack + segmentStart * safeBase,
        span: length * safeBase,
        firstTupleIndex: segmentStart,
      });
      segmentStart = i + 1;
    }
  }
  return segments;
}
