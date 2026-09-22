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

  it('reports the new schema without echoing a stale axis snapshot', async () => {
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

    // A completing fetch used to send back an axis array captured from a ref,
    // which could clobber fields added while it was in flight. It now reports
    // the schema and the reducer flags whatever is currently on the axes.
    expect(dispatch.mock.calls.some((call) => call[0]?.type === 'SET_X_AXIS_FIELDS')).toBe(false);
    const validateCalls = dispatch.mock.calls.filter(
      (call) => call[0]?.type === 'VALIDATE_ALL_FIELDS',
    );
    expect(validateCalls.length).toBeGreaterThan(0);
    expect(validateCalls[validateCalls.length - 1][0].payload.validNames).toEqual(
      expect.arrayContaining(['region', 'amount']),
    );
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

  const validateCalls = () =>
    dispatch.mock.calls
      .filter((call) => call[0]?.type === 'VALIDATE_ALL_FIELDS')
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

    // Empty name sets are how "nothing is valid any more" is expressed; the
    // reducer flags every slot, not just the axes.
    await waitFor(() => expect(validateCalls().length).toBeGreaterThan(0));
    expect(validateCalls()[0]).toEqual({ validNames: [], validMeasureNames: [] });
  });

  it('does nothing once every chip is already invalid', async () => {
    mountWith({}, [field('region', true)]);

    await waitFor(() => expect(mockApi.listDatabases).toHaveBeenCalled());
    expect(validateCalls()).toHaveLength(0);
  });

  it('does nothing when there are no chips to invalidate', async () => {
    mountWith({}, []);

    await waitFor(() => expect(mockApi.listDatabases).toHaveBeenCalled());
    expect(validateCalls()).toHaveLength(0);
  });

  it('leaves chips alone while a table is selected', async () => {
    // The column fetch still dispatches its own validation pass, so assert on
    // the verdict rather than on silence: region exists, so it stays valid.
    mockApi.listColumns.mockResolvedValue({
      columns: [{ name: 'region', data_type: 'String' }],
    } as any);
    mountWith({ selectedTable: 'orders' }, [field('region')]);

    await waitFor(() => expect(mockApi.listColumns).toHaveBeenCalled());
    await waitFor(() => expect(validateCalls().length).toBeGreaterThan(0));
    // region is in the schema, so the reducer will keep it valid.
    expect(validateCalls()[0].validNames).toEqual(expect.arrayContaining(['region']));
  });

  // Loading a configuration restores sheets first, then defers the data source
  // into a rAF + timeout after emptying `tables`. Reddening chips in that
  // window would flash every restored sheet red.
  it('leaves chips alone mid-restore, when the table list is still empty', async () => {
    mountWith({ tables: [] }, [field('region')]);

    await waitFor(() => expect(mockApi.listDatabases).toHaveBeenCalled());
    expect(validateCalls()).toHaveLength(0);
  });
});
