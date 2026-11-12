// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * How each connection type behaves in the table picker and metadata loading.
 *
 * Components ask about a trait instead of comparing connection types, so a
 * new connector is one entry here rather than an edit at every call site.
 */

import { ConnectionType } from '../types/connection';

export interface ConnectorTraits {
  /** Tables are browsed per database (ClickHouse); otherwise there is a single namespace. */
  hasDatabases: boolean;
  /** Tables are listed as soon as the connection opens, and a lone table is selected automatically. */
  listsTablesOnConnect: boolean;
  /** JOINs between tables (suggested and custom relationships) are offered. */
  supportsJoins: boolean;
  /** Tables can be UNIONed by bare name, without a database qualifier. */
  supportsNameUnion: boolean;
}

const CONNECTOR_TRAITS: Record<ConnectionType, ConnectorTraits> = {
  clickhouse: { hasDatabases: true, listsTablesOnConnect: false, supportsJoins: true, supportsNameUnion: false },
  csv: { hasDatabases: false, listsTablesOnConnect: true, supportsJoins: false, supportsNameUnion: true },
  sqlite: { hasDatabases: false, listsTablesOnConnect: true, supportsJoins: true, supportsNameUnion: true },
  kaggle: { hasDatabases: false, listsTablesOnConnect: true, supportsJoins: true, supportsNameUnion: false },
  huggingface: { hasDatabases: false, listsTablesOnConnect: true, supportsJoins: false, supportsNameUnion: false },
  // Partitions load on demand; the table picker handles them itself.
  hive_parquet: { hasDatabases: false, listsTablesOnConnect: false, supportsJoins: false, supportsNameUnion: false },
  // Measurements of one database, loaded into DuckDB at connect time.
  influxdb: { hasDatabases: false, listsTablesOnConnect: true, supportsJoins: true, supportsNameUnion: true },
};

const NO_TRAITS: ConnectorTraits = {
  hasDatabases: false,
  listsTablesOnConnect: false,
  supportsJoins: false,
  supportsNameUnion: false,
};

export function connectorTraits(type: string | null | undefined): ConnectorTraits {
  return (type && CONNECTOR_TRAITS[type as ConnectionType]) || NO_TRAITS;
}
