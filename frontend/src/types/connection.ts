// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Connection Types
 * Data source connection configuration
 */

import { Database, Table, Column } from './database';
import { ColumnCasts } from './query';

// Request body for /connect endpoint
export interface ConnectionDetails {
  type: 'csv' | 'clickhouse' | 'kaggle' | 'huggingface' | 'hive_parquet';
  file_path?: string;
  connection_string?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  // CSV configuration options
  csv_delimiter?: string;
  csv_has_header?: boolean;
  csv_decimal_separator?: string;
  csv_thousands_separator?: string;
  csv_date_format?: string;
  csv_timestamp_format?: string;
  csv_sample_size?: number;
  csv_sample_full_dataset?: boolean;
  // Column casting configuration
  column_casts?: ColumnCasts;
  // Kaggle configuration options
  kaggle_username?: string;
  kaggle_api_key?: string;
  kaggle_dataset?: string;
  kaggle_csv_files?: string[];
  // HuggingFace configuration options
  hf_token?: string;
  hf_dataset?: string;
  hf_splits?: string[];
  // Hive Parquet configuration options
  hive_file_structure?: string[];
}

// Response types for list endpoints
export interface DatabaseListResponse {
  databases: Database[];
}

export interface TableListResponse {
  tables: Table[];
}

export interface ColumnListResponse {
  columns: Column[];
}

export type PatternMode = 'regex' | 'wildcard';

export interface TableReference {
  database: string;
  table_name: string;
}

export interface PatternMatchedDatabaseTables {
  database: string;
  tables: string[];
}

export interface ClickHousePatternPreviewRequest {
  database_pattern: string;
  table_pattern: string;
  pattern_mode: PatternMode;
  max_databases?: number;
  max_total_matches?: number;
  max_tables_per_database?: number;
  current_primary?: TableReference;
  existing_union_tables?: TableReference[];
}

export interface ClickHousePatternPreviewResponse {
  matched_databases: string[];
  matches: PatternMatchedDatabaseTables[];
  resolved_tables: TableReference[];
  excluded_existing: TableReference[];
  truncated: boolean;
  warnings: string[];
}
