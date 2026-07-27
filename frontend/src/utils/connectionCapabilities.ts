// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Helpers for connection-type capabilities used across metadata/query UI.
 */

/** True when the connector requires a database/schema selection for metadata and queries. */
export function connectionRequiresDatabase(connectionType: string | null | undefined): boolean {
  return connectionType === 'clickhouse' || connectionType === 'duckdb';
}

/** True when the UI should use the database-aware table browser (TableAddPicker). */
export function connectionUsesDatabaseBrowser(connectionType: string | null | undefined): boolean {
  return connectionRequiresDatabase(connectionType);
}
