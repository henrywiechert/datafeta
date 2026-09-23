// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  dateTimeOutputName,
  resolveDateTime,
  toWireDateTime,
} from './datetimeSemantics';

// The four states a datetime field can be in. Rows 1 and 2 are the SAME state:
// a datetime column with no explicit mode behaves as "Full DateTime".
const UNCONFIGURED = { dataType: 'datetime' };
const FULL_DATETIME = { dataType: 'datetime', dateTimeMode: 'timeline' as const };
const TIMELINE_PART = {
  dataType: 'datetime',
  dateTimePart: 'hour' as const,
  dateTimeMode: 'timeline' as const,
};
const DISTINCT_PART = {
  dataType: 'datetime',
  dateTimePart: 'hour' as const,
  dateTimeMode: 'distinct' as const,
};

describe('resolveDateTime', () => {
  it('treats an unconfigured datetime column as Full DateTime', () => {
    expect(resolveDateTime(UNCONFIGURED)).toEqual({
      isDateTime: true,
      part: undefined,
      mode: 'timeline',
      isFullDateTime: true,
      isTemporalValue: true,
      isDistinctPart: false,
      hasDerivedAlias: false,
    });
  });

  it('resolves an explicit Full DateTime identically to an unconfigured one', () => {
    // The whole point: these two states must be indistinguishable.
    expect(resolveDateTime(FULL_DATETIME)).toEqual(resolveDateTime(UNCONFIGURED));
  });

  it('marks a timeline part as temporal with a derived alias', () => {
    const r = resolveDateTime(TIMELINE_PART);
    expect(r.isTemporalValue).toBe(true);
    expect(r.isDistinctPart).toBe(false);
    expect(r.hasDerivedAlias).toBe(true);
    expect(r.mode).toBe('timeline');
  });

  it('marks a distinct part as non-temporal (small integers)', () => {
    const r = resolveDateTime(DISTINCT_PART);
    expect(r.isTemporalValue).toBe(false);
    expect(r.isDistinctPart).toBe(true);
    expect(r.hasDerivedAlias).toBe(true);
  });

  it('reads the snake_case wire shape, which carries no dataType', () => {
    // A wire Dimension has no dataType, but a datetime column always has a mode
    // by the time it reaches the wire.
    expect(resolveDateTime({ date_mode: 'timeline' })).toEqual(resolveDateTime(UNCONFIGURED));
    expect(resolveDateTime({ date_part: 'hour', date_mode: 'distinct' })).toEqual(
      resolveDateTime(DISTINCT_PART),
    );
  });

  it('is not datetime for non-datetime carriers', () => {
    for (const carrier of [{ dataType: 'string' }, { dataType: 'integer' }, {}, null, undefined]) {
      expect(resolveDateTime(carrier).isDateTime).toBe(false);
      expect(resolveDateTime(carrier).isTemporalValue).toBe(false);
    }
  });

  it('does not infer datetime from a bare part with no mode and no dataType', () => {
    // date_part alone is not a datetime signal on the wire; a mode always accompanies it.
    expect(resolveDateTime({ date_part: 'hour' }).isDateTime).toBe(false);
  });
});

describe('dateTimeOutputName', () => {
  // Part-only by rule: mirrors the backend's select_builder aliasing, where
  // "Full DateTime" keeps the plain field name.
  it('keeps the plain column name for Full DateTime', () => {
    expect(dateTimeOutputName('ts', resolveDateTime(UNCONFIGURED))).toBe('ts');
    expect(dateTimeOutputName('ts', resolveDateTime(FULL_DATETIME))).toBe('ts');
  });

  it('builds <field>_<part>_<mode> for an explicit part', () => {
    expect(dateTimeOutputName('ts', resolveDateTime(TIMELINE_PART))).toBe('ts_hour_timeline');
    expect(dateTimeOutputName('ts', resolveDateTime(DISTINCT_PART))).toBe('ts_hour_distinct');
  });

  it('keeps the plain column name for a non-datetime field', () => {
    expect(dateTimeOutputName('name', resolveDateTime({ dataType: 'string' }))).toBe('name');
  });
});

describe('toWireDateTime', () => {
  it('sends a mode but no part for Full DateTime', () => {
    // Mode-only: the backend needs a mode to apply datetime handling at all,
    // including parsing a text-stored column into a real timestamp.
    expect(toWireDateTime(UNCONFIGURED)).toEqual({ date_part: undefined, date_mode: 'timeline' });
  });

  it('sends both for an explicit part', () => {
    expect(toWireDateTime(DISTINCT_PART)).toEqual({ date_part: 'hour', date_mode: 'distinct' });
  });

  it('sends nothing for a non-datetime field', () => {
    expect(toWireDateTime({ dataType: 'string' })).toEqual({});
  });
});
