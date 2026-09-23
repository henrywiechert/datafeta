// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { formatTooltipValue } from './tooltipUtils';
import { normalizeTimelineData } from '../../utils/fieldUtils';
import type { Field } from '../../types';

function field(overrides: Partial<Field>): Field {
  return {
    id: 'f1',
    columnName: 'ts',
    type: 'dimension',
    flavour: 'continuous',
    dataType: 'string',
    ...overrides,
  } as Field;
}

const MILLIS = 1_700_000_000_000; // 2023-11-14T22:13:20Z

describe('formatTooltipValue', () => {
  it('renders raw epoch values on datetime fields as human-readable dates', () => {
    const dt = field({ dataType: 'datetime' });
    expect(formatTooltipValue(MILLIS, dt)).toBe('2023-11-14 22:13:20');
  });

  it('renders Date instances as human-readable dates without a field', () => {
    expect(formatTooltipValue(new Date('2023-11-14T22:13:20Z'))).toBe('2023-11-14 22:13:20');
  });

  it('leaves distinct datetime-part integers untouched', () => {
    const hour = field({ dataType: 'datetime', dateTimePart: 'hour', dateTimeMode: 'distinct' });
    expect(formatTooltipValue(14, hour)).toBe('14');
  });

  it('treats count of a datetime column as an integer', () => {
    const cnt = field({ type: 'measure', dataType: 'datetime', aggregation: 'count' });
    expect(formatTooltipValue(5, cnt)).toBe('5');
  });

  it('keeps plain integer measures as integers', () => {
    const measure = field({ type: 'measure', dataType: 'integer', aggregation: 'sum' });
    expect(formatTooltipValue(5, measure)).toBe('5');
  });

  it('rounds floats to two decimals', () => {
    expect(formatTooltipValue(3.14159)).toBe('3.14');
  });

  it('passes strings through', () => {
    expect(formatTooltipValue('hello')).toBe('hello');
  });

  it('renders null as "null"', () => {
    expect(formatTooltipValue(null)).toBe('null');
  });
});

describe('sub-second precision reaches the tooltip', () => {
  const MICROS = 1_700_000_000_123_456; // 2023-11-14T22:13:20.123456Z

  it('keeps microseconds through normalizeTimelineData', () => {
    // End to end: the row is normalized to a Date for Observable Plot's time
    // scale, and the tooltip still recovers the µs the Date cannot hold.
    const ts = field({ dataType: 'datetime' });
    const rows = [{ ts: MICROS }];

    const [normalized] = normalizeTimelineData(rows, [ts]);

    expect(normalized.ts).toBeInstanceOf(Date);
    expect(formatTooltipValue(normalized.ts, ts)).toBe('2023-11-14 22:13:20.123456');
  });

  it('shows no fraction for whole-second values', () => {
    const ts = field({ dataType: 'datetime' });
    const [normalized] = normalizeTimelineData([{ ts: MILLIS }], [ts]);

    expect(formatTooltipValue(normalized.ts, ts)).toBe('2023-11-14 22:13:20');
  });

  it('leaves distinct parts as plain integers', () => {
    const hour = field({ dataType: 'datetime', dateTimePart: 'hour', dateTimeMode: 'distinct' });
    expect(formatTooltipValue(14, hour)).toBe('14');
  });
});
