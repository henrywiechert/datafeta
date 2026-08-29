// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { SavedConfiguration } from '../types';
import { resolveSnapshotDatabaseOverride } from './snapshotDatabaseOverride';

function clickHouseConfig(
  overrides: {
    selectedDatabase?: string;
    unionTables?: Array<{ database: string; table_name: string }>;
  } = {},
): SavedConfiguration {
  return {
    version: '1',
    exportedAt: '',
    appName: 'DataSlicer',
    connection: {
      type: 'clickhouse',
      host: 'localhost',
      port: 8123,
      user: 'default',
      database: overrides.selectedDatabase ?? 'analytics',
    },
    dataSource: {
      selectedDatabase: overrides.selectedDatabase ?? 'analytics',
      selectedTable: 'orders',
      fullTableName: 'orders',
      unionTables: overrides.unionTables,
    },
    sheets: [],
    nextSheetNumber: 1,
  };
}

describe('resolveSnapshotDatabaseOverride', () => {
  test('returns applied override for ClickHouse single-DB snapshot', () => {
    expect(resolveSnapshotDatabaseOverride(clickHouseConfig(), 'prod')).toEqual({
      applied: true,
      database: 'prod',
    });
  });

  test('trims whitespace around the database name', () => {
    expect(resolveSnapshotDatabaseOverride(clickHouseConfig(), '  staging  ')).toEqual({
      applied: true,
      database: 'staging',
    });
  });

  test('returns no override for blank or missing param', () => {
    expect(resolveSnapshotDatabaseOverride(clickHouseConfig(), null)).toEqual({
      applied: false,
    });
    expect(resolveSnapshotDatabaseOverride(clickHouseConfig(), '')).toEqual({
      applied: false,
    });
    expect(resolveSnapshotDatabaseOverride(clickHouseConfig(), '   ')).toEqual({
      applied: false,
    });
  });

  test('skips non-ClickHouse snapshots with a reason', () => {
    const csvConfig: SavedConfiguration = {
      ...clickHouseConfig(),
      connection: { type: 'csv', file_path: '/tmp/a.csv' },
    };
    expect(resolveSnapshotDatabaseOverride(csvConfig, 'prod')).toEqual({
      applied: false,
      reason: 'The database URL parameter is only supported for ClickHouse snapshots.',
    });
  });

  test('skips cross-database unions with a reason', () => {
    const config = clickHouseConfig({
      selectedDatabase: 'analytics',
      unionTables: [
        { database: 'analytics', table_name: 'a' },
        { database: 'other', table_name: 'b' },
      ],
    });
    expect(resolveSnapshotDatabaseOverride(config, 'prod')).toEqual({
      applied: false,
      reason: 'Not supported for cross-database unions',
    });
  });

  test('allows same-database unions', () => {
    const config = clickHouseConfig({
      selectedDatabase: 'analytics',
      unionTables: [
        { database: 'analytics', table_name: 'a' },
        { database: 'analytics', table_name: 'b' },
      ],
    });
    expect(resolveSnapshotDatabaseOverride(config, 'prod')).toEqual({
      applied: true,
      database: 'prod',
    });
  });
});
