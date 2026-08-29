// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { SavedConfiguration } from '../types';
import { hasCrossDatabaseUnion } from './schemaValidation';

export type SnapshotDatabaseOverrideResult =
  | { applied: true; database: string }
  | { applied: false; reason?: string };

/**
 * Resolve an optional `?database=` URL param against a saved snapshot config.
 * Only ClickHouse single-database snapshots are eligible.
 */
export function resolveSnapshotDatabaseOverride(
  config: SavedConfiguration,
  rawDatabase: string | null | undefined,
): SnapshotDatabaseOverrideResult {
  const trimmed = (rawDatabase ?? '').trim();
  if (!trimmed) {
    return { applied: false };
  }

  if (config.connection?.type !== 'clickhouse') {
    return {
      applied: false,
      reason: 'The database URL parameter is only supported for ClickHouse snapshots.',
    };
  }

  const selectedDatabase = config.dataSource?.selectedDatabase || '';
  const unionTables = config.dataSource?.unionTables || [];
  if (hasCrossDatabaseUnion(selectedDatabase, unionTables)) {
    return {
      applied: false,
      reason: 'Not supported for cross-database unions',
    };
  }

  return { applied: true, database: trimmed };
}
