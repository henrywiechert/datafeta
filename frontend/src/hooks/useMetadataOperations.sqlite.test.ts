// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { renderHook, waitFor } from '@testing-library/react';
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

function renderWithState(
  connectionDetails: { type: any },
  initial: Partial<DataSourceState>,
  setSuggestedJoinableTables = jest.fn(),
) {
  return renderHook(() => {
    const [dataSource, setDataSource] = useState<DataSourceState>({
      databases: [],
      tables: [],
      selectedDatabase: '',
      selectedTable: '',
      availableFields: [],
      isLoadingMetadata: false,
      metadataError: null,
      joinedTables: [],
      unionTables: [],
      virtualTable: null,
      fieldDisplayAliases: {},
      customRelationships: null,
      ...initial,
    });

    const dataSourceSetters = useMemo(
      () => ({
        setDatabases: (databases: any[]) => setDataSource((prev) => ({ ...prev, databases })),
        setTables: (tables: any[]) => setDataSource((prev) => ({ ...prev, tables })),
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
        setSuggestedJoinableTables,
        setSuggestedUnionableTables: jest.fn(),
        setVirtualTable: (virtualTable: any) => setDataSource((prev) => ({ ...prev, virtualTable })),
        setUnionTables: (unionTables: Array<{ database: string; table_name: string }>) =>
          setDataSource((prev) => ({ ...prev, unionTables })),
        setTablesForDatabase: jest.fn(),
      }),
      [],
    );

    useMetadataOperations({
      connectionDetails: connectionDetails as any,
      dataSource,
      dataSourceSetters,
      xAxisFields: [],
      yAxisFields: [],
      virtualColumns: [],
      dispatch: jest.fn(),
    });

    return dataSource;
  });
}

describe('useMetadataOperations for SQLite connections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.listDatabases.mockResolvedValue({ databases: [] } as any);
    mockApi.listColumns.mockResolvedValue({ columns: [] } as any);
    mockApi.getSuggestedJoins.mockResolvedValue({ suggested_tables: [] } as any);
  });

  it('fetches the table list on connect without a database', async () => {
    mockApi.listTables.mockResolvedValue({
      tables: [{ name: 'customers' }, { name: 'orders' }],
    } as any);

    const { result } = renderWithState({ type: 'sqlite' }, {});

    await waitFor(() => {
      expect(mockApi.listTables).toHaveBeenCalledWith('');
    });
    await waitFor(() => {
      expect(result.current.tables).toHaveLength(2);
    });
    // Multiple tables: the user picks the primary one.
    expect(result.current.selectedTable).toBe('');
  });

  it('auto-selects the only table in a single-table database', async () => {
    mockApi.listTables.mockResolvedValue({ tables: [{ name: 'events' }] } as any);

    const { result } = renderWithState({ type: 'sqlite' }, {});

    await waitFor(() => {
      expect(result.current.selectedTable).toBe('events');
    });
  });

  it('requests join suggestions using the connector-type placeholder database', async () => {
    mockApi.listTables.mockResolvedValue({
      tables: [{ name: 'customers' }, { name: 'orders' }],
    } as any);
    const setSuggestedJoinableTables = jest.fn();

    renderWithState({ type: 'sqlite' }, { selectedTable: 'orders' }, setSuggestedJoinableTables);

    await waitFor(() => {
      expect(mockApi.getSuggestedJoins).toHaveBeenCalled();
    });
    expect(mockApi.getSuggestedJoins).toHaveBeenCalledWith('sqlite', 'orders', [], null);
  });

  it('still passes the selected database for ClickHouse join suggestions', async () => {
    mockApi.listTables.mockResolvedValue({ tables: [{ name: 'orders' }] } as any);

    renderWithState(
      { type: 'clickhouse' },
      { selectedDatabase: 'analytics', selectedTable: 'orders' },
    );

    await waitFor(() => {
      expect(mockApi.getSuggestedJoins).toHaveBeenCalledWith('analytics', 'orders', [], null);
    });
  });
});
