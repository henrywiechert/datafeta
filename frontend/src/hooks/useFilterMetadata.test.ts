// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Both discrete entry points — the cold-start fetch and every refetch (Query Regex,
 * All/Relevant) — share `fetchDiscreteValueList`. These tests pin the invariants that
 * sharing is meant to guarantee: the same sampling threshold, the same sibling filters
 * on both endpoints, and a `constrainedByOtherFilters` flag that matches the fetch.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useFilterMetadata } from './useFilterMetadata';
import { apiService } from '../apiService';
import { DiscreteFilterMetadata, Field, FilterConfig, FilterMetadata } from '../types';

jest.mock('../apiService', () => ({
  apiService: {
    getDistinctValuesCount: jest.fn(),
    getDistinctValues: jest.fn(),
  },
}));

const mockApi = apiService as unknown as {
  getDistinctValuesCount: jest.Mock;
  getDistinctValues: jest.Mock;
};

const field: Field = {
  id: 'category',
  columnName: 'category',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const dispatch = jest.fn();

const renderFilterMetadata = (filterMetadata: Record<string, FilterMetadata> = {}) =>
  renderHook(() =>
    useFilterMetadata({
      filterFields: [field],
      filterMetadata,
      filterConfigurations: {},
      virtualColumns: [],
      selectedTable: 'sales',
      selectedDatabase: 'default',
      unionTables: [],
      connectionDetails: { type: 'clickhouse' },
      dispatch,
    }),
  );

/** Metadata that satisfies the auto-fetch effect, so only explicit refetches run. */
const settledMetadata = (): Record<string, FilterMetadata> => ({
  [field.id]: {
    fieldId: field.id,
    columnName: field.columnName,
    type: 'discrete',
    loading: false,
    availableValues: ['a'],
    totalCount: 1,
    originalTotalCount: 1,
  },
});

const siblingConfig: Record<string, FilterConfig> = {
  region: {
    fieldId: 'region',
    columnName: 'region',
    type: 'discrete',
    selectedValues: ['EU'],
  },
};

const countCallArgs = () => {
  const args = mockApi.getDistinctValuesCount.mock.calls.at(-1)!;
  return { regexPattern: args[3], siblingFilters: args[11] };
};

const valuesCallArgs = () => {
  const args = mockApi.getDistinctValues.mock.calls.at(-1)!;
  return { regexPattern: args[5], limit: args[6], random: args[7], siblingFilters: args[12] };
};

const lastDiscreteMetadata = (): DiscreteFilterMetadata => {
  const call = dispatch.mock.calls
    .map(([action]) => action)
    .filter((action) => action.type === 'SET_FILTER_METADATA' && !action.payload.metadata.loading)
    .at(-1);
  return call.payload.metadata as DiscreteFilterMetadata;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getDistinctValues.mockResolvedValue(['a', 'b']);
});

describe('discrete value list fetching', () => {
  test('lists every value when the column is small enough to enumerate', async () => {
    mockApi.getDistinctValuesCount.mockResolvedValue(12);

    renderFilterMetadata();

    await waitFor(() => expect(mockApi.getDistinctValues).toHaveBeenCalled());
    expect(valuesCallArgs()).toMatchObject({ limit: undefined, random: undefined });
    expect(lastDiscreteMetadata()).toMatchObject({
      isPartial: false,
      constrainedByOtherFilters: false,
      totalCount: 12,
    });
  });

  test('samples instead of listing once the column exceeds the threshold', async () => {
    mockApi.getDistinctValuesCount.mockResolvedValue(20001);

    renderFilterMetadata();

    await waitFor(() => expect(mockApi.getDistinctValues).toHaveBeenCalled());
    expect(valuesCallArgs()).toMatchObject({ limit: 100, random: true });
    expect(lastDiscreteMetadata().isPartial).toBe(true);
  });

  test('a refetch applies the same threshold as the cold-start fetch', async () => {
    mockApi.getDistinctValuesCount.mockResolvedValue(20001);

    const { result } = renderFilterMetadata(settledMetadata());
    await result.current.refetchFilterValues(field.id, 'abc%');

    expect(countCallArgs().regexPattern).toBe('abc%');
    expect(valuesCallArgs()).toMatchObject({ regexPattern: 'abc%', limit: 100, random: true });
  });

  test('sends the sibling constraints to both endpoints and flags the result', async () => {
    mockApi.getDistinctValuesCount.mockResolvedValue(12);

    const { result } = renderFilterMetadata(settledMetadata());
    await result.current.refetchFilterValues(field.id, undefined, {
      siblingConfigurations: siblingConfig,
    });

    const expected = [expect.objectContaining({ field: 'region', value: ['EU'] })];
    expect(countCallArgs().siblingFilters).toEqual(expected);
    expect(valuesCallArgs().siblingFilters).toEqual(expected);
    expect(lastDiscreteMetadata().constrainedByOtherFilters).toBe(true);
  });

  test('an unconstrained refetch is not flagged', async () => {
    mockApi.getDistinctValuesCount.mockResolvedValue(12);

    const { result } = renderFilterMetadata(settledMetadata());
    await result.current.refetchFilterValues(field.id);

    expect(valuesCallArgs().siblingFilters).toEqual([]);
    expect(lastDiscreteMetadata().constrainedByOtherFilters).toBe(false);
  });
});
