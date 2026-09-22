import { act, renderHook, waitFor } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { useMetadataOperations } from './useMetadataOperations';
import { apiService } from '../apiService';

jest.mock('../apiService', () => ({
  apiService: {
    listDatabases: jest.fn(),
    listTables: jest.fn(),
    listColumns: jest.fn(),
    getSuggestedJoins: jest.fn(),
    getMergedColumns: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

type DataSourceState = {
  databases: any[];
  tables: any[];
  selectedDatabase: string;
  selectedTable: string;
  availableFields: any[];
  isLoadingMetadata: boolean;
  metadataError: string | null;
  joinedTables: string[];
  unionTables: Array<{ database: string; table_name: string }>;
  virtualTable: any | null;
  fieldDisplayAliases: Record<string, string>;
  customRelationships: null;
};

describe('useMetadataOperations', () => {
  const dispatch = jest.fn();
  const connectionDetails = { type: 'clickhouse' as const };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.listDatabases.mockResolvedValue({ databases: [] } as any);
    mockApi.getSuggestedJoins.mockResolvedValue({ suggested_tables: [] } as any);
  });

  it('does not retry listTables forever when the database is missing', async () => {
    mockApi.listTables.mockRejectedValue(
      new Error("Database 'missing_db' does not exist or is no longer available."),
    );

    const { result } = renderHook(() => {
      const [dataSource, setDataSource] = useState<DataSourceState>({
        databases: [],
        tables: [],
        selectedDatabase: 'missing_db',
        selectedTable: '',
        availableFields: [],
        isLoadingMetadata: false,
        metadataError: null,
        joinedTables: [],
        unionTables: [],
        virtualTable: null,
        fieldDisplayAliases: {},
        customRelationships: null,
      });

      const dataSourceSetters = useMemo(
        () => ({
          setDatabases: (databases: any[]) =>
            setDataSource((prev) => ({ ...prev, databases })),
          setTables: (tables: any[]) =>
            setDataSource((prev) => ({ ...prev, tables })),
          setSelectedDatabase: (selectedDatabase: string) =>
            setDataSource((prev) => ({ ...prev, selectedDatabase })),
          setSelectedTable: (selectedTable: string) =>
            setDataSource((prev) => ({ ...prev, selectedTable })),
          setAvailableFields: (availableFields: any[]) =>
            setDataSource((prev) => ({ ...prev, availableFields })),
          setIsLoadingMetadata: (isLoadingMetadata: boolean) =>
            setDataSource((prev) => ({ ...prev, isLoadingMetadata })),
          setMetadataError: (metadataError: string | null) =>
            setDataSource((prev) => ({ ...prev, metadataError })),
          setSuggestedJoinableTables: jest.fn(),
          setSuggestedUnionableTables: jest.fn(),
          setVirtualTable: (virtualTable: any) =>
            setDataSource((prev) => ({ ...prev, virtualTable })),
          setUnionTables: (unionTables: Array<{ database: string; table_name: string }>) =>
            setDataSource((prev) => ({ ...prev, unionTables })),
          setTablesForDatabase: jest.fn(),
        }),
        [],
      );

      useMetadataOperations({
        connectionDetails,
        dataSource,
        dataSourceSetters,
        xAxisFields: [],
        yAxisFields: [],
        virtualColumns: [],
        dispatch,
      });

      return dataSource;
    });

    await waitFor(() => {
      expect(result.current.metadataError).toContain('does not exist or is no longer available');
    });

    await waitFor(() => {
      expect(result.current.isLoadingMetadata).toBe(false);
    });

    const callsAfterError = mockApi.listTables.mock.calls.length;
    expect(callsAfterError).toBeGreaterThanOrEqual(1);

    // Give the effect another turn after loading settles. Without the attempt
    // latch this would keep issuing listTables calls indefinitely.
    await waitFor(() => {
      expect(mockApi.listTables).toHaveBeenCalledTimes(callsAfterError);
    });

    // Extra settle window — still must not grow.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockApi.listTables).toHaveBeenCalledTimes(callsAfterError);
  });

  it('keeps axis fields when an in-flight column fetch completes after axes are set', async () => {
    let resolveColumns: (value: { columns: Array<{ name: string; data_type: string }> }) => void = () => {};
    mockApi.listColumns.mockImplementation(
      () => new Promise((resolve) => {
        resolveColumns = resolve;
      }),
    );

    const regionField = {
      id: 'field-region',
      columnName: 'region',
      type: 'dimension' as const,
      flavour: 'discrete' as const,
      dataType: 'string' as const,
    };

    const { result, rerender } = renderHook(
      ({ xAxisFields }) => {
        const [dataSource, setDataSource] = useState<DataSourceState>({
          databases: [{ name: 'analytics' }],
          tables: [{ name: 'orders' }],
          selectedDatabase: 'analytics',
          selectedTable: 'orders',
          availableFields: [regionField],
          isLoadingMetadata: false,
          metadataError: null,
          joinedTables: [],
          unionTables: [],
          virtualTable: null,
          fieldDisplayAliases: {},
          customRelationships: null,
        });

        const dataSourceSetters = useMemo(
          () => ({
            setDatabases: (databases: any[]) =>
              setDataSource((prev) => ({ ...prev, databases })),
            setTables: (tables: any[]) =>
              setDataSource((prev) => ({ ...prev, tables })),
            setSelectedDatabase: (selectedDatabase: string) =>
              setDataSource((prev) => ({ ...prev, selectedDatabase })),
            setSelectedTable: (selectedTable: string) =>
              setDataSource((prev) => ({ ...prev, selectedTable })),
            setAvailableFields: (availableFields: any[]) =>
              setDataSource((prev) => ({ ...prev, availableFields })),
            setIsLoadingMetadata: (isLoadingMetadata: boolean) =>
              setDataSource((prev) => ({ ...prev, isLoadingMetadata })),
            setMetadataError: (metadataError: string | null) =>
              setDataSource((prev) => ({ ...prev, metadataError })),
            setSuggestedJoinableTables: jest.fn(),
            setSuggestedUnionableTables: jest.fn(),
            setVirtualTable: (virtualTable: any) =>
              setDataSource((prev) => ({ ...prev, virtualTable })),
            setUnionTables: (unionTables: Array<{ database: string; table_name: string }>) =>
              setDataSource((prev) => ({ ...prev, unionTables })),
            setTablesForDatabase: jest.fn(),
          }),
          [],
        );

        return useMetadataOperations({
          connectionDetails,
          dataSource,
          dataSourceSetters,
          xAxisFields,
          yAxisFields: [],
          virtualColumns: [],
          dispatch,
        });
      },
      { initialProps: { xAxisFields: [] as typeof regionField[] } },
    );

    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.fetchColumns();
    });
    rerender({ xAxisFields: [regionField] });
    await act(async () => {
      resolveColumns({
        columns: [
          { name: 'region', data_type: 'String' },
          { name: 'amount', data_type: 'Float64' },
        ],
      });
      await pending;
    });

    const axisCalls = dispatch.mock.calls.filter((call) => call[0]?.type === 'SET_X_AXIS_FIELDS');
    expect(axisCalls.length).toBeGreaterThan(0);
    const lastPayload = axisCalls[axisCalls.length - 1][0].payload;
    expect(lastPayload.map((field: { columnName: string }) => field.columnName)).toEqual(['region']);
  });
});

describe('useMetadataOperations — axis chips with no table selected', () => {
  const dispatch = jest.fn();
  const connectionDetails = { type: 'clickhouse' as const };

  const field = (columnName: string, isInvalid?: boolean) => ({
    id: `field-${columnName}`,
    columnName,
    type: 'dimension' as const,
    flavour: 'discrete' as const,
    dataType: 'string' as const,
    ...(isInvalid === undefined ? {} : { isInvalid }),
  });

  /** Mount the hook as a freshly keyed sheet would: no transition to observe. */
  const mountWith = (overrides: Partial<DataSourceState>, xAxisFields: any[]) =>
    renderHook(() => {
      const [dataSource] = useState<DataSourceState>({
        databases: [{ name: 'analytics' }],
        tables: [{ name: 'orders' }],
        selectedDatabase: 'analytics',
        selectedTable: '',
        availableFields: [],
        isLoadingMetadata: false,
        metadataError: null,
        joinedTables: [],
        unionTables: [],
        virtualTable: null,
        fieldDisplayAliases: {},
        customRelationships: null,
        ...overrides,
      });

      const dataSourceSetters = useMemo(
        () => ({
          setDatabases: jest.fn(),
          setTables: jest.fn(),
          setSelectedDatabase: jest.fn(),
          setSelectedTable: jest.fn(),
          setAvailableFields: jest.fn(),
          setIsLoadingMetadata: jest.fn(),
          setMetadataError: jest.fn(),
          setSuggestedJoinableTables: jest.fn(),
          setSuggestedUnionableTables: jest.fn(),
          setVirtualTable: jest.fn(),
          setUnionTables: jest.fn(),
          setTablesForDatabase: jest.fn(),
        }),
        [],
      );

      return useMetadataOperations({
        connectionDetails,
        dataSource,
        dataSourceSetters,
        xAxisFields,
        yAxisFields: [],
        virtualColumns: [],
        dispatch,
      });
    });

  const axisPayloads = () =>
    dispatch.mock.calls
      .filter((call) => call[0]?.type === 'SET_X_AXIS_FIELDS')
      .map((call) => call[0].payload);

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.listDatabases.mockResolvedValue({ databases: [] } as any);
    mockApi.listTables.mockResolvedValue({ tables: [] } as any);
    mockApi.getSuggestedJoins.mockResolvedValue({ suggested_tables: [] } as any);
  });

  // The reported bug: switching sheets remounts the provider from the sheet's
  // saved state, so there is no table -> none transition to react to.
  it('invalidates on mount when a sheet is opened with no table selected', async () => {
    mountWith({}, [field('region')]);

    await waitFor(() => expect(axisPayloads().length).toBeGreaterThan(0));
    expect(axisPayloads()[0]).toEqual([expect.objectContaining({ columnName: 'region', isInvalid: true })]);
  });

  it('does nothing once every chip is already invalid', async () => {
    mountWith({}, [field('region', true)]);

    await waitFor(() => expect(mockApi.listDatabases).toHaveBeenCalled());
    expect(axisPayloads()).toHaveLength(0);
  });

  it('does nothing when there are no chips to invalidate', async () => {
    mountWith({}, []);

    await waitFor(() => expect(mockApi.listDatabases).toHaveBeenCalled());
    expect(axisPayloads()).toHaveLength(0);
  });

  it('leaves chips alone while a table is selected', async () => {
    // The column fetch still dispatches its own validation pass, so assert on
    // the verdict rather than on silence: region exists, so it stays valid.
    mockApi.listColumns.mockResolvedValue({
      columns: [{ name: 'region', data_type: 'String' }],
    } as any);
    mountWith({ selectedTable: 'orders' }, [field('region')]);

    await waitFor(() => expect(mockApi.listColumns).toHaveBeenCalled());
    await waitFor(() => expect(axisPayloads().length).toBeGreaterThan(0));
    expect(
      axisPayloads().flat().some((f: { isInvalid?: boolean }) => f.isInvalid === true),
    ).toBe(false);
  });

  // Loading a configuration restores sheets first, then defers the data source
  // into a rAF + timeout after emptying `tables`. Reddening chips in that
  // window would flash every restored sheet red.
  it('leaves chips alone mid-restore, when the table list is still empty', async () => {
    mountWith({ tables: [] }, [field('region')]);

    await waitFor(() => expect(mockApi.listDatabases).toHaveBeenCalled());
    expect(axisPayloads()).toHaveLength(0);
  });
});
