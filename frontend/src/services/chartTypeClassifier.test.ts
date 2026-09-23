// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { classifyChartType, computePointBudget, findStratifyField } from './chartTypeClassifier';
import { QueryDescription } from '../types';

const dim = (field: string, flavour: any, axis?: any, extra: any = {}) =>
  ({ field, flavour, axis, ...extra });

const qd = (dims: any[]): QueryDescription =>
  ({ target_table: 't', dimensions: dims, measures: [] } as any);

describe('findStratifyField picks the rendered tick-strip category', () => {
  it('uses the LAST discrete dim on the axis opposite the continuous one', () => {
    // chartRules renders the band axis as yDiscreteDims.slice(-1)[0].
    const q = qd([
      dim('value', 'continuous', 'x'),
      dim('first_cat', 'discrete', 'y'),
      dim('last_cat', 'discrete', 'y'),
    ]);

    expect(findStratifyField(q)).toBe('last_cat');
  });

  it('mirrors the flipped orientation (continuous on Y -> category on X)', () => {
    const q = qd([
      dim('value', 'continuous', 'y'),
      dim('first_cat', 'discrete', 'x'),
      dim('last_cat', 'discrete', 'x'),
    ]);

    expect(findStratifyField(q)).toBe('last_cat');
  });

  it('ignores discrete dims on the SAME axis as the continuous dimension', () => {
    // Those do not form the rendered band axis.
    const q = qd([
      dim('value', 'continuous', 'x'),
      dim('same_axis_cat', 'discrete', 'x'),
      dim('band_cat', 'discrete', 'y'),
    ]);

    expect(findStratifyField(q)).toBe('band_cat');
  });

  it('falls back to the same axis when the opposite axis has no dimensions', () => {
    // chartRules' singleXDim branch (yDims.length === 0) uses
    // xDiscreteDims.slice(-1)[0] -- the continuous dimension's own axis.
    const q = qd([
      dim('value', 'continuous', 'x'),
      dim('first_cat', 'discrete', 'x'),
      dim('last_cat', 'discrete', 'x'),
    ]);

    expect(findStratifyField(q)).toBe('last_cat');
  });

  it('resolves datetime-part categories to their output alias', () => {
    const q = qd([
      dim('value', 'continuous', 'x'),
      dim('dt', 'continuous', 'y', { date_part: 'year', date_mode: 'distinct' }),
    ]);

    expect(findStratifyField(q)).toBe('dt_year_distinct');
  });

  it('returns undefined for a scatter (continuous on both axes)', () => {
    const q = qd([dim('vx', 'continuous', 'x'), dim('vy', 'continuous', 'y')]);

    expect(findStratifyField(q)).toBeUndefined();
  });

  it('still prefers a discrete color field', () => {
    const q = qd([dim('value', 'continuous', 'x'), dim('band_cat', 'discrete', 'y')]);
    const colorField: any = { columnName: 'series', name: 'series', type: 'dimension', flavour: 'discrete' };

    expect(findStratifyField(q, colorField, true)).toBe('series');
  });
});

describe('findStratifyField ignores synthetic source columns', () => {
  it('never stratifies by _source_database', () => {
    // Injected for every union-capable table; single-valued on one table, so
    // partitioning by it degenerates into a global random sample.
    const q = qd([
      dim('_source_database', 'discrete', 'x'),
      dim('value', 'continuous', 'x'),
      dim('category', 'discrete', 'y'),
    ]);

    expect(findStratifyField(q)).toBe('category');
  });

  it('never stratifies by _source_table', () => {
    const q = qd([
      dim('value', 'continuous', 'x'),
      dim('category', 'discrete', 'y'),
      dim('_source_table', 'discrete', 'y'),
    ]);

    // _source_table is last on the opposite axis, but must still be skipped.
    expect(findStratifyField(q)).toBe('category');
  });

  it('returns undefined when only synthetic columns are available', () => {
    const q = qd([dim('_source_database', 'discrete', 'x'), dim('value', 'continuous', 'y')]);

    expect(findStratifyField(q)).toBeUndefined();
  });
});

describe('computePointBudget for a multi-strip tick chart', () => {
  it('stratifies by the rendered category, not the synthetic source column', () => {
    const q = qd([
      dim('_source_database', 'discrete', 'x'),
      dim('value', 'continuous', 'x'),
      dim('category', 'discrete', 'y'),
    ]);
    const budget = computePointBudget(classifyChartType(q, null, 'tick-strip'), q, null);

    expect(budget.strategy).toBe('stratified');
    expect(budget.stratifyField).toBe('category');
  });
});

describe('Full DateTime is a continuous axis, not a discrete stratum', () => {
  // Every datetime dimension reaches the wire with a date_mode ('timeline' by
  // default), so the stratum checks must stay PART-only. If they were relaxed to
  // mode-only, a plain timestamp axis would silently be treated as a category and
  // change facet detection and the point budget.
  const fullDateTime = (field: string, axis?: any) =>
    dim(field, 'continuous', axis, { date_mode: 'timeline' });

  it('does not stratify on a Full DateTime dimension', () => {
    const q = qd([dim('value', 'continuous', 'x'), fullDateTime('ts', 'y')]);

    expect(findStratifyField(q)).toBeUndefined();
  });

  it('still stratifies on an explicit datetime part', () => {
    const q = qd([
      dim('value', 'continuous', 'x'),
      dim('ts', 'discrete', 'y', { date_part: 'hour', date_mode: 'distinct' }),
    ]);

    // Stratifies on the derived alias, which is what the result rows are keyed by.
    expect(findStratifyField(q)).toBe('ts_hour_distinct');
  });

  it('does not count Full DateTime axes as faceted', () => {
    const faceted = computePointBudget(
      classifyChartType(qd([fullDateTime('ts', 'x'), fullDateTime('ts2', 'y')])),
      qd([fullDateTime('ts', 'x'), fullDateTime('ts2', 'y')]),
    );
    const single = computePointBudget(
      classifyChartType(qd([dim('a', 'continuous', 'x'), dim('b', 'continuous', 'y')])),
      qd([dim('a', 'continuous', 'x'), dim('b', 'continuous', 'y')]),
    );

    expect(faceted.maxPoints).toBe(single.maxPoints);
  });
});
