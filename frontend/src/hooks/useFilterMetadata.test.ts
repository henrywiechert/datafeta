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

type HookProps = Parameters<typeof useFilterMetadata>[0];

const baseProps = (
  filterMetadata: Record<string, FilterMetadata> = {},
  filterConfigurations: Record<string, any> = {},
): HookProps => ({
  filterFields: [field],
  filterMetadata,
  filterConfigurations,
  virtualColumns: [],
  selectedTable: 'sales',
  selectedDatabase: 'default',
  unionTables: [],
  connectionDetails: { type: 'clickhouse' },
  dispatch,
});

const renderFilterMetadata = (filterMetadata: Record<string, FilterMetadata> = {}) =>
  renderHook(() => useFilterMetadata(baseProps(filterMetadata)));

const renderWithProps = (props: HookProps) =>
  renderHook((p: HookProps) => useFilterMetadata(p), { initialProps: props });

/**
 * Mounting always fetches — no field signature is recorded yet — so a test watching
 * for a later refetch has to wait that first request out and reset the spies.
 */
const settleColdStart = async () => {
  await waitFor(() => expect(mockApi.getDistinctValues).toHaveBeenCalled());
  jest.clearAllMocks();
};

const lastConfigFor = (type: string) =>
  dispatch.mock.calls
    .map(([action]) => action)
    .filter((action) => action.type === type)
    .at(-1)?.payload.config;

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

/**
 * A field survives a table change untouched, so the per-field effect never fires for
 * it. Only the table-scope effect can notice that the values behind every filter
 * just moved — without it the pickers keep listing the old tables' values.
 */
describe('table-scope changes refresh the value lists', () => {
  const settledProps = () =>
    baseProps(settledMetadata(), {
      [field.id]: {
        fieldId: field.id,
        columnName: field.columnName,
        type: 'discrete',
        selectedValues: ['a'],
        totalAvailableCount: 1,
      },
    });

  /** Mount, let the cold-start fetch finish, then apply `next` and report what refetched. */
  const applyChange = async (next: Partial<HookProps>) => {
    const props = settledProps();
    const { rerender } = renderWithProps(props);
    await settleColdStart();

    rerender({ ...props, ...next });
    await waitFor(() => expect(mockApi.getDistinctValues).toHaveBeenCalled());
  };

  beforeEach(() => {
    mockApi.getDistinctValuesCount.mockResolvedValue(2);
  });

  test('a union table added refetches', async () => {
    await applyChange({ unionTables: [{ database: 'other', table_name: 'sales' }] });
  });

  test('the primary table changing refetches', async () => {
    await applyChange({ selectedTable: 'returns' });
  });

  test('the primary database changing refetches', async () => {
    await applyChange({ selectedDatabase: 'other' });
  });

  test('a JOIN changing the virtual table refetches', async () => {
    await applyChange({
      virtualTable: {
        primary_table: 'sales',
        mode: 'join',
        joined_tables: [],
        union_tables: [],
      },
    });
  });

  test('the picker keeps its values while the refresh is in flight', async () => {
    const props = settledProps();
    const { rerender } = renderWithProps(props);
    await settleColdStart();

    rerender({ ...props, unionTables: [{ database: 'other', table_name: 'sales' }] });

    // The loading placeholder carries the old list forward, so DiscreteFilterControl
    // shows its overlay instead of tearing the checkbox list down to a spinner.
    const loadingDispatch = dispatch.mock.calls
      .map(([action]) => action)
      .find((action) => action.type === 'SET_FILTER_METADATA' && action.payload.metadata.loading);
    expect(loadingDispatch.payload.metadata.availableValues).toEqual(['a']);
  });

  test('a re-render with the same tables does not refetch', async () => {
    const props = settledProps();
    const { rerender } = renderWithProps(props);
    await settleColdStart();

    // New array identities, same tables.
    rerender({ ...props, unionTables: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockApi.getDistinctValues).not.toHaveBeenCalled();
  });
});

/**
 * `totalAvailableCount` is what the query builder compares the selection against to
 * decide it can omit `IN (...)`. Left at the old cardinality it either drops a filter
 * that should still apply, or hides everything a newly added table brought in.
 */
describe('reconciling a discrete config to a changed value universe', () => {
  const renderAfterTableChange = async (existingConfig: any, newValues: any[]) => {
    mockApi.getDistinctValuesCount.mockResolvedValue(newValues.length);
    mockApi.getDistinctValues.mockResolvedValue(newValues);

    const props = baseProps(settledMetadata(), { [field.id]: existingConfig });
    const { rerender } = renderWithProps(props);
    await settleColdStart();

    rerender({ ...props, unionTables: [{ database: 'other', table_name: 'sales' }] });
    await waitFor(() => expect(mockApi.getDistinctValues).toHaveBeenCalled());
  };

  const discreteConfig = (overrides: any) => ({
    fieldId: field.id,
    columnName: field.columnName,
    type: 'discrete',
    ...overrides,
  });

  test('a fully selected filter extends to the values the new table brought in', async () => {
    await renderAfterTableChange(
      discreteConfig({ selectedValues: ['a', 'b'], totalAvailableCount: 2 }),
      ['a', 'b', 'c'],
    );

    await waitFor(() =>
      expect(lastConfigFor('SET_AND_APPLY_FILTER_CONFIGURATION_SILENT')).toMatchObject({
        selectedValues: ['a', 'b', 'c'],
        totalAvailableCount: 3,
      }),
    );
  });

  test('a partial selection keeps its picks and drops the values that are gone', async () => {
    await renderAfterTableChange(
      discreteConfig({ selectedValues: ['a', 'b'], totalAvailableCount: 4 }),
      ['a', 'c'],
    );

    await waitFor(() =>
      expect(lastConfigFor('SET_AND_APPLY_FILTER_CONFIGURATION_SILENT')).toMatchObject({
        selectedValues: ['a'],
        totalAvailableCount: 2,
      }),
    );
  });

  test('an unchanged value universe writes no config', async () => {
    await renderAfterTableChange(
      discreteConfig({ selectedValues: ['a', 'b'], totalAvailableCount: 2 }),
      ['a', 'b'],
    );

    await waitFor(() => expect(lastDiscreteMetadata()).toBeDefined());
    expect(lastConfigFor('SET_AND_APPLY_FILTER_CONFIGURATION_SILENT')).toBeUndefined();
  });

  test('a pattern-mode filter is left alone — it names no values to reconcile', async () => {
    await renderAfterTableChange(
      discreteConfig({
        selectedValues: [],
        matchMode: 'pattern',
        pattern: 'a%',
        totalAvailableCount: 2,
      }),
      ['a', 'b', 'c'],
    );

    await waitFor(() => expect(lastDiscreteMetadata()).toBeDefined());
    expect(lastConfigFor('SET_AND_APPLY_FILTER_CONFIGURATION_SILENT')).toBeUndefined();
  });
});
