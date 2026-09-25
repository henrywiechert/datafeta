// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { computeSharedNumericDomains } from './numericDomains';

const rows = [
  { utc: new Date('2026-01-16T12:26:58.811Z'), 'SUM(v)': 1 },
  { utc: new Date('2026-01-16T12:32:24.000Z'), 'SUM(v)': 2 },
];
const measure = { columnName: 'v', type: 'measure', flavour: 'continuous', aggregation: 'sum' };

describe('computeSharedNumericDomains', () => {
  it.each([
    ['no explicit mode (freshly dropped Full DateTime)', {}],
    ['explicit timeline mode', { dateTimeMode: 'timeline' }],
  ])('builds a date domain for a datetime dimension with %s', (_label, mode) => {
    const x = { columnName: 'utc', type: 'dimension', flavour: 'continuous', dataType: 'datetime', ...mode };
    const domain = computeSharedNumericDomains(rows, [x], [measure]).utc;
    expect(domain).toBeDefined();
    const [min, max] = domain as [Date, Date];
    expect(min).toBeInstanceOf(Date);
    expect(min.getTime()).toBeLessThanOrEqual(rows[0].utc.getTime());
    expect(max.getTime()).toBeGreaterThanOrEqual(rows[1].utc.getTime());
    expect(min.getUTCFullYear()).toBe(2026);
  });
});
