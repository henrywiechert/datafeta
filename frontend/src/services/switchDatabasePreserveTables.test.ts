// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { apiService } from '../apiService';
import { Field } from '../types';
import { switchDatabasePreserveTables } from './switchDatabasePreserveTables';

jest.mock('../apiService', () => ({
  apiService: {
    listTables: jest.fn(),
    listColumns: jest.fn(),
    getMergedColumns: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

const axisField = (columnName: string): Field => ({
  id: `field-${columnName}`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
});

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
    setMeasureGroupFields: jest.fn(),
    patchAxisFields: jest.fn(),
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
    const xAxisFields = [axisField('region')];
    const yAxisFields = [axisField('amount')];

    await switchDatabasePreserveTables({
      oldDatabase: 'analytics',
      newDatabase: 'analytics_prod',
      selectedTable: 'orders',
      joinedTables: [],
      unionTables: [],
      customRelationships: null,
      fieldDisplayAliases: {},
      measureGroupFields: [],
      xAxisFields,
      yAxisFields,
      virtualColumns: [],
      sheets: [],
      sessionFilterFields: [],
      ...setters,
    });

    expect(setters.setAvailableFields.mock.calls.some((call) => call[0].length === 0)).toBe(false);
    expect(setters.patchAxisFields).toHaveBeenCalledTimes(1);
    const [patchedX, patchedY] = setters.patchAxisFields.mock.calls[0];
    expect(patchedX.map((f: Field) => f.columnName)).toEqual(['region']);
    expect(patchedY.map((f: Field) => f.columnName)).toEqual(['amount']);
    expect(patchedX[0].isInvalid).toBe(false);
    expect(patchedY[0].isInvalid).toBe(false);
  });
});
