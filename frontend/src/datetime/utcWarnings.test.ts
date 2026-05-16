// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { detectNonUtcDateLike, warnIfNonUtc } from './utcWarnings';

describe('utcWarnings', () => {
  const originalWarn = console.warn;
  beforeEach(() => {
    console.warn = jest.fn();
  });
  afterEach(() => {
    console.warn = originalWarn;
  });

  it('detects offsetful datetime strings (non-UTC)', () => {
    expect(detectNonUtcDateLike('2024-01-01T00:00:00+02:00')).toBe(true);
    expect(detectNonUtcDateLike('2024-01-01T00:00:00Z')).toBe(false);
  });

  it('warns when non-UTC values present', () => {
    warnIfNonUtc(['2024-01-01T00:00:00+02:00', '2024-01-01T00:00:00Z'], 'test');
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not warn for empty or UTC-only values', () => {
    warnIfNonUtc([], 'empty');
    warnIfNonUtc(['2024-01-01T00:00:00Z'], 'utc only');
    expect(console.warn).not.toHaveBeenCalled();
  });
});
