// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * The panel resizes when the exact distinct count replaces the estimate, which can
 * pull its edge out from under the pointer and fire a fresh mouseenter. These tests
 * pin that a hover only ever loads a profile once, so that re-entry cannot silently
 * downgrade an exact count back to the estimate.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useFieldProfile } from './useFieldProfile';
import { apiService } from '../apiService';
import { Field, FieldProfile } from '../types';

jest.mock('../apiService', () => ({
  apiService: { getFieldProfile: jest.fn() },
}));

jest.mock('../contexts/DataSourceContext', () => ({
  useDataSource: () => ({ dataSource: { virtualColumns: [] } }),
}));

jest.mock('../contexts/DataSourceContext/hooks', () => ({
  useDataSourceMetadata: () => ({ selectedTable: 'sales', selectedDatabase: 'default' }),
  useDataSourceMultiTable: () => ({ virtualTable: null }),
}));

const mockApi = apiService as unknown as { getFieldProfile: jest.Mock };

const field: Field = {
  id: 'category',
  columnName: 'category',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const profile = (approximate: boolean, distinct: number): FieldProfile => ({
  field: 'category',
  profile_kind: 'string',
  approximate,
  row_count: 1000,
  null_count: 0,
  distinct_count: distinct,
  duration_ms: 1,
});

beforeEach(() => {
  jest.useFakeTimers();
  mockApi.getFieldProfile.mockReset();
  mockApi.getFieldProfile.mockImplementation((request: { approximate?: boolean }) =>
    Promise.resolve(profile(request.approximate !== false, request.approximate === false ? 42 : 40)),
  );
});

afterEach(() => {
  jest.useRealTimers();
});

/** Run the hover-intent timer and let the resulting promise settle. */
const settleHover = async () => {
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
};

it('loads the estimate once the hover-intent delay elapses', async () => {
  const { result } = renderHook(() => useFieldProfile(field));

  act(() => result.current.start());
  expect(mockApi.getFieldProfile).not.toHaveBeenCalled();

  await settleHover();

  await waitFor(() => expect(result.current.profile?.distinct_count).toBe(40));
  expect(result.current.profile?.approximate).toBe(true);
  expect(mockApi.getFieldProfile).toHaveBeenCalledTimes(1);
});

it('keeps the exact count when the pointer leaves and re-enters', async () => {
  const { result } = renderHook(() => useFieldProfile(field));

  act(() => result.current.start());
  await settleHover();
  await waitFor(() => expect(result.current.profile).not.toBeNull());

  await act(async () => {
    result.current.loadExact();
  });
  await waitFor(() => expect(result.current.profile?.approximate).toBe(false));
  expect(result.current.profile?.distinct_count).toBe(42);

  // The panel shrank under the pointer: mouseleave, then mouseenter.
  act(() => result.current.cancel());
  act(() => result.current.start());
  await settleHover();

  expect(mockApi.getFieldProfile).toHaveBeenCalledTimes(2);
  expect(result.current.profile?.approximate).toBe(false);
  expect(result.current.profile?.distinct_count).toBe(42);
});

it('does not re-query when the pointer re-enters after the estimate loaded', async () => {
  const { result } = renderHook(() => useFieldProfile(field));

  act(() => result.current.start());
  await settleHover();
  await waitFor(() => expect(result.current.profile).not.toBeNull());

  act(() => result.current.cancel());
  act(() => result.current.start());
  await settleHover();

  expect(mockApi.getFieldProfile).toHaveBeenCalledTimes(1);
});

it('retries after the pointer leaves before the request settled', async () => {
  const { result } = renderHook(() => useFieldProfile(field));

  act(() => result.current.start());
  act(() => result.current.cancel());
  await settleHover();
  expect(mockApi.getFieldProfile).not.toHaveBeenCalled();

  act(() => result.current.start());
  await settleHover();
  await waitFor(() => expect(result.current.profile).not.toBeNull());
  expect(mockApi.getFieldProfile).toHaveBeenCalledTimes(1);
});
