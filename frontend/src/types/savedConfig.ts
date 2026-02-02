/**
 * Save/Load Configuration Types
 * Types for persisting and restoring configurations
 */

import { ColumnCasts } from './query';
import { TableJoinDefinition } from './multiTable';
import { VirtualColumnDefinition } from './virtualColumn';
import { Field } from './field';
import { Sheet } from './sheet';

/**
 * Connection metadata for saved configurations.
 * Excludes sensitive information like passwords.
 */
export interface SavedConnectionMetadata {
  type: 'csv' | 'clickhouse' | 'kaggle';
  // CSV-specific fields
  file_path?: string;
  csv_delimiter?: string;
  csv_has_header?: boolean;
  csv_decimal_separator?: string;
  csv_thousands_separator?: string;
  csv_date_format?: string;
  csv_timestamp_format?: string;
  // ClickHouse-specific fields (NO password)
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  // Kaggle-specific fields (NO API key)
  kaggle_dataset?: string;
  kaggle_csv_files?: string[];
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
}

/**
 * Metadata for a server-stored snapshot
 */
export interface SnapshotMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
