// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useConnectionForm - Custom hook for managing connection form state.
 * 
 * Consolidates the 30+ useState calls from DataSourceSelectionPage into
 * a single useReducer with typed state per connection type.
 */

import { useReducer, useCallback } from 'react';
import { ConnectionDetails } from '../types';
import { apiService } from '../apiService';
import {
  ConnectionType,
  ConnectionFormState,
  ConnectionFormAction,
  CsvFormState,
  ClickHouseFormState,
  KaggleFormState,
  HuggingFaceFormState,
  HiveParquetFormState,
  ValidationResult,
  DEFAULT_CSV_STATE,
  DEFAULT_CLICKHOUSE_STATE,
  DEFAULT_KAGGLE_STATE,
  DEFAULT_HUGGINGFACE_STATE,
  DEFAULT_HIVE_PARQUET_STATE,
} from '../components/ConnectionForms/types';

function csvStateFromDetails(details: ConnectionDetails): CsvFormState {
  return {
    ...DEFAULT_CSV_STATE,
    delimiter: details.csv_delimiter || ',',
    hasHeader: details.csv_has_header ?? true,
    decimalSeparator: details.csv_decimal_separator || '.',
    thousandsSeparator: details.csv_thousands_separator || '',
    dateFormat: details.csv_date_format || '%Y-%m-%d',
    timestampFormat: details.csv_timestamp_format || '%Y-%m-%d %H:%M:%S',
    sampleSize: details.csv_sample_size || 1000,
    sampleFullDataset: details.csv_sample_full_dataset || false,
  };
}

function appendCsvParsingDetails(details: ConnectionDetails, csv: CsvFormState): void {
  details.csv_delimiter = csv.delimiter;
  details.csv_has_header = csv.hasHeader;
  details.csv_decimal_separator = csv.decimalSeparator;
  details.csv_thousands_separator = csv.thousandsSeparator;
  details.csv_date_format = csv.dateFormat;
  details.csv_timestamp_format = csv.timestampFormat;
  details.csv_sample_size = Math.max(1, Number(csv.sampleSize) || 1000);
  details.csv_sample_full_dataset = csv.sampleFullDataset;
}

// Initial state
const initialState: ConnectionFormState = {
  connectionType: 'clickhouse',
  csv: DEFAULT_CSV_STATE,
  clickHouse: DEFAULT_CLICKHOUSE_STATE,
  kaggle: DEFAULT_KAGGLE_STATE,
  huggingFace: DEFAULT_HUGGINGFACE_STATE,
  hiveParquet: DEFAULT_HIVE_PARQUET_STATE,
};

// Reducer function
function connectionFormReducer(
  state: ConnectionFormState,
  action: ConnectionFormAction
): ConnectionFormState {
  switch (action.type) {
    case 'SET_CONNECTION_TYPE':
      return { ...state, connectionType: action.payload };

    case 'UPDATE_CSV':
      return { ...state, csv: { ...state.csv, ...action.payload } };

    case 'UPDATE_CLICKHOUSE':
      return { ...state, clickHouse: { ...state.clickHouse, ...action.payload } };

    case 'UPDATE_KAGGLE':
      return { ...state, kaggle: { ...state.kaggle, ...action.payload } };

    case 'UPDATE_HUGGINGFACE':
      return { ...state, huggingFace: { ...state.huggingFace, ...action.payload } };

    case 'UPDATE_HIVE_PARQUET':
      return { ...state, hiveParquet: { ...state.hiveParquet, ...action.payload } };

    case 'RESET_CSV':
      return { ...state, csv: DEFAULT_CSV_STATE };

    case 'RESET_CLICKHOUSE':
      return { ...state, clickHouse: DEFAULT_CLICKHOUSE_STATE };

    case 'RESET_KAGGLE':
      return { ...state, kaggle: DEFAULT_KAGGLE_STATE };

    case 'RESET_HUGGINGFACE':
      return { ...state, huggingFace: DEFAULT_HUGGINGFACE_STATE };

    case 'RESET_HIVE_PARQUET':
      return { ...state, hiveParquet: DEFAULT_HIVE_PARQUET_STATE };

    case 'SYNC_FROM_CONNECTION': {
      const { type, details } = action.payload;
      const newState = { ...state, connectionType: type };

      if (type === 'clickhouse') {
        newState.clickHouse = {
          connectionString: details.connection_string || '',
          host: details.host || 'localhost',
          port: details.port || 8123,
          user: details.user || 'default',
          password: details.password || '',
          database: details.database || 'default',
        };
      } else if (type === 'csv') {
        newState.csv = csvStateFromDetails(details);
      } else if (type === 'kaggle') {
        newState.kaggle = {
          ...DEFAULT_KAGGLE_STATE,
          username: details.kaggle_username || '',
          apiKey: details.kaggle_api_key || '',
          selectedDataset: details.kaggle_dataset || '',
        };
        newState.csv = csvStateFromDetails(details);
      } else if (type === 'huggingface') {
        newState.huggingFace = {
          ...DEFAULT_HUGGINGFACE_STATE,
          token: details.hf_token || '',
          selectedDataset: details.hf_dataset || '',
          selectedSplits: details.hf_splits || [],
        };
      } else if (type === 'hive_parquet') {
        newState.hiveParquet = {
          ...DEFAULT_HIVE_PARQUET_STATE,
          fileStructure: details.hive_file_structure || [],
        };
      }

      return newState;
    }

    default:
      return state;
  }
}

// Hook return type
export interface UseConnectionFormReturn {
  // Connection type
  connectionType: ConnectionType;
  setConnectionType: (type: ConnectionType) => void;

  // Per-type state accessors
  csvState: CsvFormState;
  clickHouseState: ClickHouseFormState;
  kaggleState: KaggleFormState;
  huggingFaceState: HuggingFaceFormState;
  hiveParquetState: HiveParquetFormState;

  // Per-type state setters (grouped updates)
  updateCsvState: (updates: Partial<CsvFormState>) => void;
  updateClickHouseState: (updates: Partial<ClickHouseFormState>) => void;
  updateKaggleState: (updates: Partial<KaggleFormState>) => void;
  updateHuggingFaceState: (updates: Partial<HuggingFaceFormState>) => void;
  updateHiveParquetState: (updates: Partial<HiveParquetFormState>) => void;

  // Validation and building
  validateForm: () => ValidationResult;
  buildConnectionDetails: () => ConnectionDetails;

  // Kaggle-specific actions
  searchKaggleDatasets: () => Promise<void>;
  selectKaggleDataset: (ref: string) => Promise<void>;
  loadKaggleFilesManual: () => Promise<void>;

  // HuggingFace-specific actions
  searchHuggingFaceDatasets: () => Promise<void>;
  selectHuggingFaceDataset: (ref: string) => Promise<void>;
  loadHuggingFaceSplitsManual: () => Promise<void>;

  // File handling (supports multiple files)
  handleFileChange: (files: File[] | null) => void;
  handleHiveFolderSelect: (files: File[] | null) => void;

  // Sync with existing connection
  syncFromConnectionDetails: (details: ConnectionDetails) => void;
}

/**
 * Custom hook for managing connection form state.
 */
export function useConnectionForm(): UseConnectionFormReturn {
  const [state, dispatch] = useReducer(connectionFormReducer, initialState);

  // Connection type setter
  const setConnectionType = useCallback((type: ConnectionType) => {
    dispatch({ type: 'SET_CONNECTION_TYPE', payload: type });
  }, []);

  // Per-type state setters
  const updateCsvState = useCallback((updates: Partial<CsvFormState>) => {
    dispatch({ type: 'UPDATE_CSV', payload: updates });
  }, []);

  const updateClickHouseState = useCallback((updates: Partial<ClickHouseFormState>) => {
    dispatch({ type: 'UPDATE_CLICKHOUSE', payload: updates });
  }, []);

  const updateKaggleState = useCallback((updates: Partial<KaggleFormState>) => {
    dispatch({ type: 'UPDATE_KAGGLE', payload: updates });
  }, []);

  const updateHuggingFaceState = useCallback((updates: Partial<HuggingFaceFormState>) => {
    dispatch({ type: 'UPDATE_HUGGINGFACE', payload: updates });
  }, []);

  const updateHiveParquetState = useCallback((updates: Partial<HiveParquetFormState>) => {
    dispatch({ type: 'UPDATE_HIVE_PARQUET', payload: updates });
  }, []);

  // File handling for CSV/Parquet (supports multiple files)
  const handleFileChange = useCallback((files: File[] | null) => {
    if (files && files.length > 0) {
      updateCsvState({
        selectedFiles: files,
        fileNames: files.map((f) => f.name),
      });
    } else {
      updateCsvState({ selectedFiles: [], fileNames: [] });
    }
  }, [updateCsvState]);

  // File handling for Hive Parquet folder selection
  const handleHiveFolderSelect = useCallback((files: File[] | null) => {
    if (files && files.length > 0) {
      updateHiveParquetState({
        selectedFolder: files,
      });
    } else {
      updateHiveParquetState({
        selectedFolder: null,
        fileStructure: [],
        partitionFiles: new Map(),
      });
    }
  }, [updateHiveParquetState]);

  // Validation
  const validateForm = useCallback((): ValidationResult => {
    const { connectionType, csv, clickHouse, kaggle, huggingFace, hiveParquet } = state;

    if (connectionType === 'csv') {
      if (!csv.selectedFiles || csv.selectedFiles.length === 0) {
        return { isValid: false, errorMessage: 'At least one file is required. Please select CSV or Parquet file(s).' };
      }
      return { isValid: true, errorMessage: null };
    }

    if (connectionType === 'hive_parquet') {
      if (!hiveParquet.fileStructure || hiveParquet.fileStructure.length === 0) {
        return { isValid: false, errorMessage: 'Please select a folder containing Hive-partitioned Parquet files.' };
      }
      return { isValid: true, errorMessage: null };
    }

    if (connectionType === 'kaggle') {
      if (!kaggle.username || !kaggle.apiKey || !kaggle.selectedDataset) {
        return {
          isValid: false,
          errorMessage: 'Please provide Kaggle credentials and select a dataset',
        };
      }
      return { isValid: true, errorMessage: null };
    }

    if (connectionType === 'huggingface') {
      if (!huggingFace.selectedDataset) {
        return {
          isValid: false,
          errorMessage: 'Please select a HuggingFace dataset',
        };
      }
      if (huggingFace.splits.length > 0 && huggingFace.selectedSplits.length === 0) {
        return {
          isValid: false,
          errorMessage: 'Please select at least one allowed HuggingFace split',
        };
      }
      return { isValid: true, errorMessage: null };
    }

    if (connectionType === 'clickhouse') {
      if (!clickHouse.connectionString && !clickHouse.host) {
        return {
          isValid: false,
          errorMessage: 'For ClickHouse, provide Connection String or Host.',
        };
      }
      return { isValid: true, errorMessage: null };
    }

    return { isValid: true, errorMessage: null };
  }, [state]);

  // Build ConnectionDetails from current state
  const buildConnectionDetails = useCallback((): ConnectionDetails => {
    const { connectionType, csv, clickHouse, kaggle, huggingFace, hiveParquet } = state;

    const details: ConnectionDetails = { type: connectionType };

    if (connectionType === 'csv') {
      appendCsvParsingDetails(details, csv);
    } else if (connectionType === 'hive_parquet') {
      details.hive_file_structure = hiveParquet.fileStructure;
    } else if (connectionType === 'kaggle') {
      details.kaggle_username = kaggle.username;
      details.kaggle_api_key = kaggle.apiKey;
      details.kaggle_dataset = kaggle.selectedDataset;
      details.kaggle_csv_files = kaggle.files.map((f) => f.name);
      appendCsvParsingDetails(details, csv);
    } else if (connectionType === 'huggingface') {
      details.hf_dataset = huggingFace.selectedDataset;
      if (huggingFace.token) {
        details.hf_token = huggingFace.token;
      }
      if (huggingFace.selectedSplits.length > 0) {
        details.hf_splits = huggingFace.selectedSplits;
      }
    } else if (connectionType === 'clickhouse') {
      if (clickHouse.connectionString) {
        details.connection_string = clickHouse.connectionString;
      } else {
        details.host = clickHouse.host;
        details.port = Number(clickHouse.port) || 8123;
        details.user = clickHouse.user;
        details.password = clickHouse.password;
        details.database = clickHouse.database;
      }
    }

    return details;
  }, [state]);

  // Kaggle: Search datasets
  const searchKaggleDatasets = useCallback(async () => {
    const { kaggle } = state;

    if (!kaggle.username || !kaggle.apiKey) {
      updateKaggleState({ searchError: 'Please enter your Kaggle username and API key' });
      return;
    }

    updateKaggleState({
      isSearching: true,
      searchError: '',
      datasets: [],
      selectedDataset: '',
      files: [],
    });

    try {
      const result = await apiService.searchKaggleDatasets(
        kaggle.username,
        kaggle.apiKey,
        kaggle.searchQuery
      );
      updateKaggleState({
        datasets: result.datasets,
        isSearching: false,
        searchError: result.datasets.length === 0 ? 'No datasets found matching your search' : '',
      });
    } catch (err) {
      updateKaggleState({
        isSearching: false,
        searchError: err instanceof Error ? err.message : 'Failed to search Kaggle datasets',
      });
      console.error('Kaggle search error:', err);
    }
  }, [state, updateKaggleState]);

  // Kaggle: Select a dataset and load its files
  const selectKaggleDataset = useCallback(
    async (datasetRef: string) => {
      const { kaggle } = state;

      updateKaggleState({
        selectedDataset: datasetRef,
        files: [],
        selectedFile: '',
      });

      try {
        const result = await apiService.listKaggleFiles(
          kaggle.username,
          kaggle.apiKey,
          datasetRef
        );
        updateKaggleState({ files: result.files });
      } catch (err) {
        updateKaggleState({
          searchError: err instanceof Error ? err.message : 'Failed to list dataset files',
        });
        console.error('Kaggle files error:', err);
      }
    },
    [state, updateKaggleState]
  );

  // Kaggle: Load files from manual dataset entry
  const loadKaggleFilesManual = useCallback(async () => {
    const { kaggle } = state;

    if (!kaggle.manualDataset) {
      updateKaggleState({ searchError: 'Please enter a dataset reference' });
      return;
    }

    if (!kaggle.manualDataset.includes('/')) {
      updateKaggleState({ searchError: 'Dataset must be in format: owner/dataset-name' });
      return;
    }

    updateKaggleState({
      searchError: '',
      selectedDataset: kaggle.manualDataset,
      files: [],
      selectedFile: '',
    });

    try {
      const result = await apiService.listKaggleFiles(
        kaggle.username,
        kaggle.apiKey,
        kaggle.manualDataset
      );
      updateKaggleState({ files: result.files });
    } catch (err) {
      updateKaggleState({
        searchError: err instanceof Error ? err.message : 'Failed to list dataset files',
      });
      console.error('Kaggle files error:', err);
    }
  }, [state, updateKaggleState]);

  // HuggingFace: Search datasets
  const searchHuggingFaceDatasets = useCallback(async () => {
    const { huggingFace } = state;

    updateHuggingFaceState({
      isSearching: true,
      searchError: '',
      datasets: [],
      selectedDataset: '',
      splits: [],
      selectedSplits: [],
    });

    try {
      const result = await apiService.searchHuggingFaceDatasets(
        huggingFace.token,
        huggingFace.searchQuery
      );
      updateHuggingFaceState({
        datasets: result.datasets,
        isSearching: false,
        searchError: result.datasets.length === 0 ? 'No datasets found matching your search' : '',
      });
    } catch (err) {
      updateHuggingFaceState({
        isSearching: false,
        searchError: err instanceof Error ? err.message : 'Failed to search HuggingFace datasets',
      });
      console.error('HuggingFace search error:', err);
    }
  }, [state, updateHuggingFaceState]);

  // HuggingFace: Select a dataset and load Parquet-backed split tables
  const selectHuggingFaceDataset = useCallback(
    async (datasetRef: string) => {
      const { huggingFace } = state;

      updateHuggingFaceState({
        selectedDataset: datasetRef,
        splits: [],
        selectedSplits: [],
      });

      try {
        const result = await apiService.listHuggingFaceSplits(
          huggingFace.token,
          datasetRef
        );
        const selectableSplits = result.splits
          .filter((split) => !split.is_too_large)
          .map((split) => split.table_name);
        updateHuggingFaceState({
          splits: result.splits,
          selectedSplits: selectableSplits,
          searchError: result.warning || '',
        });
      } catch (err) {
        updateHuggingFaceState({
          searchError: err instanceof Error ? err.message : 'Failed to list HuggingFace splits',
        });
        console.error('HuggingFace splits error:', err);
      }
    },
    [state, updateHuggingFaceState]
  );

  // HuggingFace: Load splits from manual dataset entry
  const loadHuggingFaceSplitsManual = useCallback(async () => {
    const { huggingFace } = state;

    if (!huggingFace.manualDataset) {
      updateHuggingFaceState({ searchError: 'Please enter a dataset reference' });
      return;
    }

    if (!huggingFace.manualDataset.includes('/')) {
      updateHuggingFaceState({ searchError: 'Dataset must be in format: owner/dataset-name' });
      return;
    }

    updateHuggingFaceState({
      searchError: '',
      selectedDataset: huggingFace.manualDataset,
      splits: [],
      selectedSplits: [],
    });

    try {
      const result = await apiService.listHuggingFaceSplits(
        huggingFace.token,
        huggingFace.manualDataset
      );
      const selectableSplits = result.splits
        .filter((split) => !split.is_too_large)
        .map((split) => split.table_name);
      updateHuggingFaceState({
        splits: result.splits,
        selectedSplits: selectableSplits,
        searchError: result.warning || '',
      });
    } catch (err) {
      updateHuggingFaceState({
        searchError: err instanceof Error ? err.message : 'Failed to list HuggingFace splits',
      });
      console.error('HuggingFace splits error:', err);
    }
  }, [state, updateHuggingFaceState]);

  // Sync form state from existing ConnectionDetails (when reconnecting)
  const syncFromConnectionDetails = useCallback((details: ConnectionDetails) => {
    dispatch({
      type: 'SYNC_FROM_CONNECTION',
      payload: { type: details.type, details },
    });
  }, []);

  return {
    connectionType: state.connectionType,
    setConnectionType,
    csvState: state.csv,
    clickHouseState: state.clickHouse,
    kaggleState: state.kaggle,
    huggingFaceState: state.huggingFace,
    hiveParquetState: state.hiveParquet,
    updateCsvState,
    updateClickHouseState,
    updateKaggleState,
    updateHuggingFaceState,
    updateHiveParquetState,
    validateForm,
    buildConnectionDetails,
    searchKaggleDatasets,
    selectKaggleDataset,
    loadKaggleFilesManual,
    searchHuggingFaceDatasets,
    selectHuggingFaceDataset,
    loadHuggingFaceSplitsManual,
    handleFileChange,
    handleHiveFolderSelect,
    syncFromConnectionDetails,
  };
}

