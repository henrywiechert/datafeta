// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { DiscreteFilterConfig } from '../types';
import { hasPendingFilterApply } from './filterApplyPending';

function discrete(
  id: string,
  overrides: Partial<DiscreteFilterConfig> = {},
): DiscreteFilterConfig {
  return {
    fieldId: id,
    columnName: id,
    type: 'discrete',
    selectedValues: ['a'],
    scope: 'sheet',
    ...overrides,
  };
}

describe('hasPendingFilterApply', () => {
  test('returns false when draft and applied merges match', () => {
    const local = { local: discrete('local') };
    const session = { session: discrete('session', { scope: 'session' }) };

    expect(hasPendingFilterApply(local, session, local, session)).toBe(false);
  });

  test('returns true when a local selection differs from applied', () => {
    const draftLocal = { local: discrete('local', { selectedValues: ['b'] }) };
    const appliedLocal = { local: discrete('local', { selectedValues: ['a'] }) };

    expect(hasPendingFilterApply(draftLocal, {}, appliedLocal, {})).toBe(true);
  });

  test('returns true when valueListMode differs', () => {
    const draftLocal = { local: discrete('local', { valueListMode: 'relevant' }) };
    const appliedLocal = { local: discrete('local', { valueListMode: 'all' }) };

    expect(hasPendingFilterApply(draftLocal, {}, appliedLocal, {})).toBe(true);
  });

  test('returns true for a session-only draft change', () => {
    const draftSession = {
      session: discrete('session', { scope: 'session', selectedValues: ['x'] }),
    };
    const appliedSession = {
      session: discrete('session', { scope: 'session', selectedValues: ['y'] }),
    };

    expect(hasPendingFilterApply({}, draftSession, {}, appliedSession)).toBe(true);
  });

  test('ignores object key order when configs are equivalent', () => {
    const a = discrete('local', { selectedValues: ['a', 'b'], valueListMode: 'all' });
    const b = {
      valueListMode: 'all' as const,
      selectedValues: ['a', 'b'],
      type: 'discrete' as const,
      scope: 'sheet' as const,
      columnName: 'local',
      fieldId: 'local',
    };

    expect(hasPendingFilterApply({ local: a }, {}, { local: b }, {})).toBe(false);
  });
});
