// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { apiService } from '../apiService';
import { switchDatabasePreserveTables } from './switchDatabasePreserveTables';

jest.mock('../apiService', () => ({
  apiService: {
    listTables: jest.fn(),
    listColumns: jest.fn(),
    getMergedColumns: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

function makeSetters() {
  return {
    setSelectedDatabase: jest.fn(),
    setUnionTables: jest.fn(),
    setTables: jest.fn(),
    setTablesForDatabase: jest.fn(),
    setAvailableFields: jest.fn(),
    setVirtualTable: jest.fn(),
    setIsLoadingMetadata: jest.fn(),
    setMetadataError: jest.fn(),
    validateAllFields: jest.fn(),
    onUpdateConnectionDatabase: jest.fn(),
  };
}

describe('switchDatabasePreserveTables', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.listTables.mockResolvedValue({ tables: [{ name: 'orders' }] } as any);
    mockApi.listColumns.mockResolvedValue({
      columns: [
        { name: 'region', data_type: 'String' },
        { name: 'amount', data_type: 'Float64' },
      ],
    } as any);
  });

  it('keeps axis fields and does not blank available fields mid-switch', async () => {
    const setters = makeSetters();
    await switchDatabasePreserveTables({
      oldDatabase: 'analytics',
      newDatabase: 'analytics_prod',
      selectedTable: 'orders',
      joinedTables: [],
      unionTables: [],
      customRelationships: null,
      fieldDisplayAliases: {},
      virtualColumns: [],
      sheets: [],
      sessionFilterFields: [],
      ...setters,
    });

    expect(setters.setAvailableFields.mock.calls.some((call) => call[0].length === 0)).toBe(false);
    // The service now reports the new schema and the reducer flags the fields,
    // so there is no stale axis snapshot to send back.
    expect(setters.validateAllFields).toHaveBeenCalledTimes(1);
    const [validNames, validMeasureNames] = setters.validateAllFields.mock.calls[0];
    expect(validNames).toEqual(expect.arrayContaining(['region', 'amount']));
    expect(validMeasureNames).toEqual(['amount']);
  });
});
