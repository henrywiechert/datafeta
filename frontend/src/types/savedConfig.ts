// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Save/Load Configuration Types
 * Types for persisting and restoring configurations
 */

import { ColumnCasts } from './query';
import { TableJoinDefinition, ForeignKeyRelationship } from './multiTable';
import { VirtualColumnDefinition } from './virtualColumn';
import { Field } from './field';
import { FilterConfig } from './filter';
import { Sheet } from './sheet';

/**
 * Connection metadata for saved configurations.
 * Excludes sensitive information like passwords.
 */
export interface SavedConnectionMetadata {
  type: 'csv' | 'clickhouse' | 'kaggle' | 'huggingface' | 'hive_parquet';
  // CSV-specific fields
  file_path?: string;
  csv_delimiter?: string;
  csv_has_header?: boolean;
  csv_decimal_separator?: string;
  csv_thousands_separator?: string;
  csv_date_format?: string;
  csv_timestamp_format?: string;
  csv_sample_size?: number;
  csv_sample_full_dataset?: boolean;
  // ClickHouse-specific fields (NO password)
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  // Kaggle-specific fields (NO API key)
  kaggle_dataset?: string;
  kaggle_csv_files?: string[];
  // HuggingFace-specific fields (NO token)
  hf_dataset?: string;
  hf_splits?: string[];
  // Hive Parquet-specific fields
  hive_file_structure?: string[];
  hive_loaded_partitions?: string[];
  hive_primary_partition?: string;
  hive_union_partitions?: string[];
  // Column casting configuration
  column_casts?: ColumnCasts;
}

/**
 * Data source selection state
 */
export interface SavedDataSourceSelection {
  selectedDatabase: string;
  selectedTable: string;
  fullTableName: string;
  unionTables?: Array<{database: string, table_name: string}>;
  joinedTables?: TableJoinDefinition[];
  virtualColumns?: VirtualColumnDefinition[];
  virtualColumnFieldPreferences?: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>;
  measureGroupFields?: Field[];
  fieldDisplayAliases?: Record<string, string>;
  customRelationships?: ForeignKeyRelationship[];
}

/**
 * Session (global) filters that apply across all sheets.
 */
export interface SavedSessionFilters {
  fields: Field[];
  configurations: Record<string, FilterConfig>;
}

/**
 * Complete saved configuration
 */
export interface SavedConfiguration {
  version: string;
  exportedAt: string;
  appName: string;
  connection?: SavedConnectionMetadata;
  dataSource?: SavedDataSourceSelection;
  sheets: Sheet[];
  activeSheetId?: string;
  nextSheetNumber: number;
  sessionFilters?: SavedSessionFilters;
}

/**
 * Metadata for a server-stored snapshot
 */
export interface SnapshotMetadata {
  id: string;
  name: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
}
