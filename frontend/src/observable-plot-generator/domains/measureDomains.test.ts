// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { computeSharedMeasureDomains } from './measureDomains';
import { DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';

const measure = { columnName: 'v', type: 'measure', flavour: 'continuous', aggregation: 'sum' };
const category = { columnName: 'cat', type: 'dimension', flavour: 'discrete' };
// Two rows per category, e.g. split by a tooltip dimension
const rows = [
  { cat: 'a', 'SUM(v)': 4 },
  { cat: 'a', 'SUM(v)': 4 },
  { cat: 'b', 'SUM(v)': 1 },
];

describe('computeSharedMeasureDomains', () => {
  it('uses the per-row extent when nothing stacks', () => {
    const domain = computeSharedMeasureDomains(rows, [], [measure], undefined, category);
    expect(domain['SUM(v)']).toEqual([0, 4 * (1 + DOMAIN_PAD_RATIO)]);
  });

  it('uses per-category stack totals for stacked marks without color', () => {
    const domain = computeSharedMeasureDomains(rows, [], [measure], undefined, category, undefined, true);
    expect(domain['SUM(v)']).toEqual([0, 8 * (1 + DOMAIN_PAD_RATIO)]);
  });
});
