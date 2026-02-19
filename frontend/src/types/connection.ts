/**
 * Connection Types
 * Data source connection configuration
 */

import { Database, Table, Column } from './database';
import { ColumnCasts } from './query';

// Request body for /connect endpoint
export interface ConnectionDetails {
  type: 'csv' | 'clickhouse' | 'kaggle' | 'hive_parquet';
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
  // Column casting configuration
  column_casts?: ColumnCasts;
  // Kaggle configuration options
  kaggle_username?: string;
  kaggle_api_key?: string;
  kaggle_dataset?: string;
  kaggle_csv_files?: string[];
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
