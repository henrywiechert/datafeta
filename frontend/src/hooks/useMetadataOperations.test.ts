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
          setMeasureGroupFields: jest.fn(),
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
        measureGroupFields: [],
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
});
