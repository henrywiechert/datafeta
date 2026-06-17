// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { 
  SavedConfiguration, 
  SavedConnectionMetadata, 
  ConnectionDetails,
  Field,
  FilterConfig,
  Sheet,
  TableJoinDefinition,
  UserChartType,
  VirtualColumnDefinition,
  ForeignKeyRelationship
} from '../types';
import { ClickHouseOverrides } from '../components/ConnectionRestoreDialog';

const CURRENT_VERSION = '1.0.0';
const APP_NAME = 'data-slicer';

type VirtualColumnFieldPreferences = Record<
  string,
  { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }
>;

// Type definitions for File System Access API
interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}

interface ShowSaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

interface WindowWithFileSystem extends Window {
  showSaveFilePicker?(options?: ShowSaveFilePickerOptions): Promise<FileSystemFileHandle>;
}

/**
 * Info about loaded hive partitions, used when saving snapshots.
 */
export interface HivePartitionInfo {
  loadedPartitions: string[];
  primaryPartition: string;
  unionPartitions: string[];
}

/**
 * Creates a SavedConnectionMetadata object from ConnectionDetails,
 * stripping out sensitive information like passwords.
 */
export function sanitizeConnectionDetails(
  details: ConnectionDetails | null,
  hivePartitionInfo?: HivePartitionInfo
): SavedConnectionMetadata | undefined {
  if (!details) return undefined;

  const sanitized: SavedConnectionMetadata = {
    type: details.type,
  };

  if (details.type === 'csv') {
    // CSV configuration
    if (details.file_path) sanitized.file_path = details.file_path;
    if (details.csv_delimiter) sanitized.csv_delimiter = details.csv_delimiter;
    if (details.csv_has_header !== undefined) sanitized.csv_has_header = details.csv_has_header;
    if (details.csv_decimal_separator) sanitized.csv_decimal_separator = details.csv_decimal_separator;
    if (details.csv_thousands_separator) sanitized.csv_thousands_separator = details.csv_thousands_separator;
    if (details.csv_date_format) sanitized.csv_date_format = details.csv_date_format;
    if (details.csv_timestamp_format) sanitized.csv_timestamp_format = details.csv_timestamp_format;
    if (details.csv_sample_size) sanitized.csv_sample_size = details.csv_sample_size;
    if (details.csv_sample_full_dataset !== undefined) sanitized.csv_sample_full_dataset = details.csv_sample_full_dataset;
  } else if (details.type === 'clickhouse') {
    // ClickHouse configuration (NO password)
    if (details.host) sanitized.host = details.host;
    if (details.port) sanitized.port = details.port;
    if (details.user) sanitized.user = details.user;
    if (details.database) sanitized.database = details.database;
    // Explicitly DO NOT include password or connection_string
  } else if (details.type === 'kaggle') {
    // Kaggle configuration (NO API key)
    if (details.kaggle_dataset) sanitized.kaggle_dataset = details.kaggle_dataset;
    if (details.kaggle_csv_files) sanitized.kaggle_csv_files = details.kaggle_csv_files;
    if (details.csv_delimiter) sanitized.csv_delimiter = details.csv_delimiter;
    if (details.csv_has_header !== undefined) sanitized.csv_has_header = details.csv_has_header;
    if (details.csv_decimal_separator) sanitized.csv_decimal_separator = details.csv_decimal_separator;
    if (details.csv_thousands_separator) sanitized.csv_thousands_separator = details.csv_thousands_separator;
    if (details.csv_date_format) sanitized.csv_date_format = details.csv_date_format;
    if (details.csv_timestamp_format) sanitized.csv_timestamp_format = details.csv_timestamp_format;
    if (details.csv_sample_size) sanitized.csv_sample_size = details.csv_sample_size;
    if (details.csv_sample_full_dataset !== undefined) {
      sanitized.csv_sample_full_dataset = details.csv_sample_full_dataset;
    }
    // Explicitly DO NOT include kaggle_username or kaggle_api_key
  } else if (details.type === 'huggingface') {
    // HuggingFace configuration (NO token)
    if (details.hf_dataset) sanitized.hf_dataset = details.hf_dataset;
    if (details.hf_splits) sanitized.hf_splits = details.hf_splits;
  } else if (details.type === 'hive_parquet') {
    // Hive Parquet configuration
    if (details.hive_file_structure) sanitized.hive_file_structure = details.hive_file_structure;
    if (hivePartitionInfo) {
      sanitized.hive_loaded_partitions = hivePartitionInfo.loadedPartitions;
      sanitized.hive_primary_partition = hivePartitionInfo.primaryPartition;
      sanitized.hive_union_partitions = hivePartitionInfo.unionPartitions;
    }
  }

  // Column casting configuration
  if (details.column_casts) {
    sanitized.column_casts = details.column_casts;
  }

  return sanitized;
}

/**
 * Exports the current application state to a SavedConfiguration object.
 * Note: measureGroupFields is now per-sheet (stored in each sheet's visualizationState)
 */
export function exportConfiguration(
  sheets: Sheet[],
  activeSheetId: string,
  nextSheetNumber: number,
  connectionDetails: ConnectionDetails | null,
  selectedDatabase: string,
  selectedTable: string,
  unionTables?: Array<{database: string, table_name: string}>,
  joinedTables?: TableJoinDefinition[],
  virtualColumns?: VirtualColumnDefinition[],
  virtualColumnFieldPreferences?: VirtualColumnFieldPreferences,
  fieldDisplayAliases?: Record<string, string>,
  hivePartitionInfo?: HivePartitionInfo,
  sessionFilterFields?: Field[],
  sessionFilterConfigurations?: Record<string, FilterConfig>,
  customRelationships?: ForeignKeyRelationship[] | null,
): SavedConfiguration {
  const normalizedSheets = sheets.map((sheet) => ({
    ...sheet,
    visualizationState: {
      ...sheet.visualizationState,
      selectedChartType: (sheet.visualizationState.globalChartType ?? 'auto') as UserChartType | 'auto',
    },
  }));

  const config: SavedConfiguration = {
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    appName: APP_NAME,
    sheets: normalizedSheets,
    activeSheetId,
    nextSheetNumber,
  };

  // Add connection metadata if available (sanitized)
  const sanitizedConnection = sanitizeConnectionDetails(connectionDetails, hivePartitionInfo);
  if (sanitizedConnection) {
    config.connection = sanitizedConnection;
  }

  // Add data source selection if available
  if (selectedDatabase || selectedTable) {
    // Construct full table name (database.table or just table for CSV)
    const fullTableName = selectedDatabase 
      ? `${selectedDatabase}.${selectedTable}`
      : selectedTable;
    
    config.dataSource = {
      selectedDatabase,
      selectedTable,
      fullTableName,
    };
    
    // Add union tables if present
    if (unionTables && unionTables.length > 0) {
      config.dataSource.unionTables = unionTables;
    }
    
    // Add joined tables if present
    if (joinedTables && joinedTables.length > 0) {
      config.dataSource.joinedTables = joinedTables;
    }

    if (virtualColumns && virtualColumns.length > 0) {
      config.dataSource.virtualColumns = virtualColumns;
    }

    if (virtualColumnFieldPreferences && Object.keys(virtualColumnFieldPreferences).length > 0) {
      config.dataSource.virtualColumnFieldPreferences = virtualColumnFieldPreferences;
    }
    
    if (fieldDisplayAliases && Object.keys(fieldDisplayAliases).length > 0) {
      config.dataSource.fieldDisplayAliases = fieldDisplayAliases;
    }

    // Add custom relationships if in manual mode (non-null array, including empty)
    if (customRelationships !== undefined && customRelationships !== null) {
      config.dataSource.customRelationships = customRelationships;
    }
    // Note: measureGroupFields is now per-sheet (stored in each sheet's visualizationState)
  }

  if (sessionFilterFields && sessionFilterFields.length > 0 && sessionFilterConfigurations) {
    config.sessionFilters = {
      fields: sessionFilterFields,
      configurations: sessionFilterConfigurations,
    };
  }

  return config;
}

/**
 * Validates a loaded configuration object.
 * Throws an error if validation fails.
 */
export function validateConfiguration(config: any): SavedConfiguration {
  // Check if it's an object
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid configuration: not an object');
  }

  // Check app name
  if (config.appName !== APP_NAME) {
    throw new Error(`Invalid configuration: expected appName "${APP_NAME}", got "${config.appName}"`);
  }

  // Check version exists
  if (!config.version || typeof config.version !== 'string') {
    throw new Error('Invalid configuration: missing or invalid version');
  }

  // Check version compatibility (for now, accept any 1.x.x version)
  const versionMatch = config.version.match(/^(\d+)\./);
  if (!versionMatch || versionMatch[1] !== '1') {
    throw new Error(`Incompatible configuration version: ${config.version}. Expected 1.x.x`);
  }

  // Check sheets array
  if (!Array.isArray(config.sheets)) {
    throw new Error('Invalid configuration: sheets must be an array');
  }

  if (config.sheets.length === 0) {
    throw new Error('Invalid configuration: must have at least one sheet');
  }

  // Validate each sheet has required fields
  config.sheets.forEach((sheet: any, index: number) => {
    if (!sheet.id || !sheet.name || !sheet.visualizationState) {
      throw new Error(`Invalid sheet at index ${index}: missing required fields`);
    }
  });

  // Validate connection metadata if present
  if (config.connection) {
    if (!config.connection.type || !['csv', 'clickhouse', 'kaggle', 'huggingface', 'hive_parquet'].includes(config.connection.type)) {
      throw new Error('Invalid configuration: connection.type must be "csv", "clickhouse", "kaggle", "huggingface", or "hive_parquet"');
    }
  }

  // Add backward compatibility: generate fullTableName if missing
  if (config.dataSource && !config.dataSource.fullTableName) {
    const { selectedDatabase, selectedTable } = config.dataSource;
    config.dataSource.fullTableName = selectedDatabase 
      ? `${selectedDatabase}.${selectedTable}`
      : selectedTable;
  }

  return config as SavedConfiguration;
}

/**
 * Imports and validates a configuration from JSON string.
 */
export function importConfiguration(jsonString: string): SavedConfiguration {
  try {
    const parsed = JSON.parse(jsonString);
    return validateConfiguration(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format: ' + error.message);
    }
    throw error;
  }
}

/**
 * Generates a default filename for the configuration.
 */
function getDefaultFilename(): string {
  return `data-slicer-config-${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * Saves the configuration file using a file dialog if available, otherwise falls back to download.
 * Uses the File System Access API in supported browsers, or prompts for filename in others.
 */
export async function saveConfigFile(config: SavedConfiguration): Promise<void> {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const defaultFilename = getDefaultFilename();

  // Check if File System Access API is available (Chrome, Edge, Opera)
  const windowWithFS = window as WindowWithFileSystem;
  if (windowWithFS.showSaveFilePicker) {
    try {
      const fileHandle = await windowWithFS.showSaveFilePicker({
        suggestedName: defaultFilename,
        types: [{
          description: 'JSON Configuration Files',
          accept: { 'application/json': ['.json'] }
        }]
      });

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error: any) {
      // User cancelled the dialog, or error occurred
      if (error.name === 'AbortError') {
        return; // User cancelled, don't show error
      }
      // Fall through to fallback method
      console.warn('File System Access API failed, using fallback:', error);
    }
  }

  // Fallback: Prompt for filename or use default
  let filename = defaultFilename;
  
  // Try to get filename from user via prompt
  const userInput = prompt('Enter filename (or press OK to use default):', defaultFilename);
  if (userInput !== null) {
    // User provided input
    if (userInput.trim()) {
      // Ensure it has .json extension
      filename = userInput.trim().endsWith('.json') 
        ? userInput.trim() 
        : `${userInput.trim()}.json`;
    }
    // If empty, use default filename
  } else {
    // User cancelled prompt, don't save
    return;
  }

  // Use the download method as fallback
  downloadConfigFile(config, filename);
}

/**
 * Triggers a browser download of the configuration as a JSON file.
 * This is used as a fallback when the File System Access API is not available.
 */
export function downloadConfigFile(config: SavedConfiguration, filename?: string): void {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || getDefaultFilename();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Reads a file as text and returns a promise.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(new Error('File reading error'));
    reader.readAsText(file);
  });
}

/**
 * Reconstructs ConnectionDetails from SavedConnectionMetadata.
 * Note: Password/credentials must be provided separately by the user.
 * For ClickHouse, optional overrides can be provided for host, port, user, database.
 */
export function reconstructConnectionDetails(
  metadata: SavedConnectionMetadata,
  password?: string,
  kaggleUsername?: string,
  kaggleApiKey?: string,
  clickHouseOverrides?: ClickHouseOverrides
): ConnectionDetails {
  const details: ConnectionDetails = {
    type: metadata.type,
  };

  if (metadata.type === 'csv') {
    // CSV configuration
    if (metadata.file_path) details.file_path = metadata.file_path;
    if (metadata.csv_delimiter) details.csv_delimiter = metadata.csv_delimiter;
    if (metadata.csv_has_header !== undefined) details.csv_has_header = metadata.csv_has_header;
    if (metadata.csv_decimal_separator) details.csv_decimal_separator = metadata.csv_decimal_separator;
    if (metadata.csv_thousands_separator) details.csv_thousands_separator = metadata.csv_thousands_separator;
    if (metadata.csv_date_format) details.csv_date_format = metadata.csv_date_format;
    if (metadata.csv_timestamp_format) details.csv_timestamp_format = metadata.csv_timestamp_format;
    if (metadata.csv_sample_size) details.csv_sample_size = metadata.csv_sample_size;
    if (metadata.csv_sample_full_dataset !== undefined) details.csv_sample_full_dataset = metadata.csv_sample_full_dataset;
  } else if (metadata.type === 'clickhouse') {
    // ClickHouse configuration - use overrides if provided, otherwise fall back to metadata
    details.host = clickHouseOverrides?.host ?? metadata.host;
    details.port = clickHouseOverrides?.port ?? metadata.port;
    details.user = clickHouseOverrides?.user ?? metadata.user;
    details.database = clickHouseOverrides?.database ?? metadata.database;
    if (password) details.password = password;
  } else if (metadata.type === 'kaggle') {
    // Kaggle configuration
    if (metadata.kaggle_dataset) details.kaggle_dataset = metadata.kaggle_dataset;
    if (metadata.kaggle_csv_files) details.kaggle_csv_files = metadata.kaggle_csv_files;
    if (metadata.csv_delimiter) details.csv_delimiter = metadata.csv_delimiter;
    if (metadata.csv_has_header !== undefined) details.csv_has_header = metadata.csv_has_header;
    if (metadata.csv_decimal_separator) details.csv_decimal_separator = metadata.csv_decimal_separator;
    if (metadata.csv_thousands_separator) details.csv_thousands_separator = metadata.csv_thousands_separator;
    if (metadata.csv_date_format) details.csv_date_format = metadata.csv_date_format;
    if (metadata.csv_timestamp_format) details.csv_timestamp_format = metadata.csv_timestamp_format;
    if (metadata.csv_sample_size) details.csv_sample_size = metadata.csv_sample_size;
    if (metadata.csv_sample_full_dataset !== undefined) {
      details.csv_sample_full_dataset = metadata.csv_sample_full_dataset;
    }
    if (kaggleUsername) details.kaggle_username = kaggleUsername;
    if (kaggleApiKey) details.kaggle_api_key = kaggleApiKey;
  } else if (metadata.type === 'huggingface') {
    // HuggingFace configuration. Token is intentionally not saved.
    if (metadata.hf_dataset) details.hf_dataset = metadata.hf_dataset;
    if (metadata.hf_splits) details.hf_splits = metadata.hf_splits;
  } else if (metadata.type === 'hive_parquet') {
    // Hive Parquet configuration
    if (metadata.hive_file_structure) details.hive_file_structure = metadata.hive_file_structure;
  }

  // Column casting configuration
  if (metadata.column_casts) {
    details.column_casts = metadata.column_casts;
  }

  return details;
}

