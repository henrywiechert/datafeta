/**
 * Form state types for connection forms.
 * These replace the 30+ loose useState calls in the original DataSourceSelectionPage.
 */

import { KaggleDataset, KaggleFile } from '../../types';

// Connection type union
export type ConnectionType = 'csv' | 'clickhouse' | 'kaggle';

// CSV form state
export interface CsvFormState {
  selectedFile: File | null;
  filePath: string;
  delimiter: string;
  hasHeader: boolean;
  decimalSeparator: string;
  thousandsSeparator: string;
  dateFormat: string;
  timestampFormat: string;
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

// Validation result
export interface ValidationResult {
  isValid: boolean;
  errorMessage: string | null;
}

// Default values for form state initialization
export const DEFAULT_CSV_STATE: CsvFormState = {
  selectedFile: null,
  filePath: '',
  delimiter: ',',
  hasHeader: true,
  decimalSeparator: '.',
  thousandsSeparator: '',
  dateFormat: '%Y-%m-%d',
  timestampFormat: '%Y-%m-%d %H:%M:%S',
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

// Combined form state for useReducer
export interface ConnectionFormState {
  connectionType: ConnectionType;
  csv: CsvFormState;
  clickHouse: ClickHouseFormState;
  kaggle: KaggleFormState;
}

// Action types for useReducer
export type ConnectionFormAction =
  | { type: 'SET_CONNECTION_TYPE'; payload: ConnectionType }
  | { type: 'UPDATE_CSV'; payload: Partial<CsvFormState> }
  | { type: 'UPDATE_CLICKHOUSE'; payload: Partial<ClickHouseFormState> }
  | { type: 'UPDATE_KAGGLE'; payload: Partial<KaggleFormState> }
  | { type: 'RESET_CSV' }
  | { type: 'RESET_CLICKHOUSE' }
  | { type: 'RESET_KAGGLE' }
  | { type: 'SYNC_FROM_CONNECTION'; payload: { type: ConnectionType; details: any } };

