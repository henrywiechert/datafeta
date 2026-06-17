// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Form state types for connection forms.
 * These replace the 30+ loose useState calls in the original DataSourceSelectionPage.
 */

import { HuggingFaceDataset, HuggingFaceSplit, KaggleDataset, KaggleFile } from '../../types';

// Connection type union
export type ConnectionType = 'csv' | 'clickhouse' | 'kaggle' | 'huggingface' | 'hive_parquet';

// File form state (supports CSV and Parquet files)
export interface CsvFormState {
  selectedFiles: File[];  // Multiple files supported
  fileNames: string[];    // Display names for selected files
  delimiter: string;
  hasHeader: boolean;
  decimalSeparator: string;
  thousandsSeparator: string;
  dateFormat: string;
  timestampFormat: string;
  sampleSize: number | string;
  sampleFullDataset: boolean;
  showAdvancedOptions: boolean;
}

// ClickHouse form state
export interface ClickHouseFormState {
  connectionString: string;
  host: string;
  port: number | string;
  user: string;
  password: string;
  database: string;
}

// Kaggle form state
export interface KaggleFormState {
  username: string;
  apiKey: string;
  searchQuery: string;
  datasets: KaggleDataset[];
  selectedDataset: string;
  files: KaggleFile[];
  selectedFile: string;
  isSearching: boolean;
  searchError: string;
  manualMode: boolean;
  manualDataset: string;
}

// HuggingFace form state
export interface HuggingFaceFormState {
  token: string;
  searchQuery: string;
  datasets: HuggingFaceDataset[];
  selectedDataset: string;
  splits: HuggingFaceSplit[];
  selectedSplits: string[];
  isSearching: boolean;
  searchError: string;
  manualMode: boolean;
  manualDataset: string;
}

// Hive Parquet form state
export interface HiveParquetFormState {
  selectedFolder: File[] | null;     // All File objects from folder picker
  fileStructure: string[];           // Relative paths for backend
  partitionColumn: string | null;    // Detected from backend response
  availablePartitions: string[];     // Tables returned by backend
  partitionFiles: Map<string, File[]>; // partition -> files (for lazy upload)
  error: string | null;              // Error message if any
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  errorMessage: string | null;
}

// Default values for form state initialization
export const DEFAULT_CSV_STATE: CsvFormState = {
  selectedFiles: [],
  fileNames: [],
  delimiter: ',',
  hasHeader: true,
  decimalSeparator: '.',
  thousandsSeparator: '',
  dateFormat: '%Y-%m-%d',
  timestampFormat: '%Y-%m-%d %H:%M:%S',
  sampleSize: 1000,
  sampleFullDataset: false,
  showAdvancedOptions: false,
};

export const DEFAULT_CLICKHOUSE_STATE: ClickHouseFormState = {
  connectionString: '',
  host: 'localhost',
  port: 8123,
  user: 'default',
  password: '',
  database: 'default',
};

export const DEFAULT_KAGGLE_STATE: KaggleFormState = {
  username: '',
  apiKey: '',
  searchQuery: '',
  datasets: [],
  selectedDataset: '',
  files: [],
  selectedFile: '',
  isSearching: false,
  searchError: '',
  manualMode: false,
  manualDataset: '',
};

export const DEFAULT_HUGGINGFACE_STATE: HuggingFaceFormState = {
  token: '',
  searchQuery: '',
  datasets: [],
  selectedDataset: '',
  splits: [],
  selectedSplits: [],
  isSearching: false,
  searchError: '',
  manualMode: false,
  manualDataset: '',
};

export const DEFAULT_HIVE_PARQUET_STATE: HiveParquetFormState = {
  selectedFolder: null,
  fileStructure: [],
  partitionColumn: null,
  availablePartitions: [],
  partitionFiles: new Map(),
  error: null,
};

// Combined form state for useReducer
export interface ConnectionFormState {
  connectionType: ConnectionType;
  csv: CsvFormState;
  clickHouse: ClickHouseFormState;
  kaggle: KaggleFormState;
  huggingFace: HuggingFaceFormState;
  hiveParquet: HiveParquetFormState;
}

// Action types for useReducer
export type ConnectionFormAction =
  | { type: 'SET_CONNECTION_TYPE'; payload: ConnectionType }
  | { type: 'UPDATE_CSV'; payload: Partial<CsvFormState> }
  | { type: 'UPDATE_CLICKHOUSE'; payload: Partial<ClickHouseFormState> }
  | { type: 'UPDATE_KAGGLE'; payload: Partial<KaggleFormState> }
  | { type: 'UPDATE_HUGGINGFACE'; payload: Partial<HuggingFaceFormState> }
  | { type: 'UPDATE_HIVE_PARQUET'; payload: Partial<HiveParquetFormState> }
  | { type: 'RESET_CSV' }
  | { type: 'RESET_CLICKHOUSE' }
  | { type: 'RESET_KAGGLE' }
  | { type: 'RESET_HUGGINGFACE' }
  | { type: 'RESET_HIVE_PARQUET' }
  | { type: 'SYNC_FROM_CONNECTION'; payload: { type: ConnectionType; details: any } };

