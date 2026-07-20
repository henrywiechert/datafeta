// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { deduplicateFilterValues } from './filterValueKey';

describe('deduplicateFilterValues', () => {
  test('keeps one entry for values that the filter UI treats as identical', () => {
    expect(deduplicateFilterValues([
      'Alpha',
      'Alpha',
      1,
      '1',
      null,
      undefined,
      '2026-07-15T09:30:00',
      '2026-07-15 09:30:00',
    ])).toEqual([
      'Alpha',
      1,
      null,
      '2026-07-15T09:30:00',
    ]);
  });
});
