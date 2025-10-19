import { 
  SavedConfiguration, 
  SavedConnectionMetadata, 
  ConnectionDetails,
  Sheet 
} from '../types';

const CURRENT_VERSION = '1.0.0';
const APP_NAME = 'data-slicer';

/**
 * Creates a SavedConnectionMetadata object from ConnectionDetails,
 * stripping out sensitive information like passwords.
 */
export function sanitizeConnectionDetails(
  details: ConnectionDetails | null
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
  } else if (details.type === 'clickhouse') {
    // ClickHouse configuration (NO password)
    if (details.host) sanitized.host = details.host;
    if (details.port) sanitized.port = details.port;
    if (details.user) sanitized.user = details.user;
    if (details.database) sanitized.database = details.database;
    // Explicitly DO NOT include password or connection_string
  }

  // Column casting configuration
  if (details.column_casts) {
    sanitized.column_casts = details.column_casts;
  }

  return sanitized;
}

/**
 * Exports the current application state to a SavedConfiguration object.
 */
export function exportConfiguration(
  sheets: Sheet[],
  activeSheetId: string,
  nextSheetNumber: number,
  connectionDetails: ConnectionDetails | null,
  selectedDatabase: string,
  selectedTable: string
): SavedConfiguration {
  const config: SavedConfiguration = {
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    appName: APP_NAME,
    sheets,
    activeSheetId,
    nextSheetNumber,
  };

  // Add connection metadata if available (sanitized)
  const sanitizedConnection = sanitizeConnectionDetails(connectionDetails);
  if (sanitizedConnection) {
    config.connection = sanitizedConnection;
  }

  // Add data source selection if available
  if (selectedDatabase || selectedTable) {
    config.dataSource = {
      selectedDatabase,
      selectedTable,
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
    if (!config.connection.type || !['csv', 'clickhouse'].includes(config.connection.type)) {
      throw new Error('Invalid configuration: connection.type must be "csv" or "clickhouse"');
    }
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
 * Triggers a browser download of the configuration as a JSON file.
 */
export function downloadConfigFile(config: SavedConfiguration, filename?: string): void {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `data-slicer-config-${new Date().toISOString().slice(0, 10)}.json`;
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
 * Note: Password must be provided separately by the user.
 */
export function reconstructConnectionDetails(
  metadata: SavedConnectionMetadata,
  password?: string
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
  } else if (metadata.type === 'clickhouse') {
    // ClickHouse configuration
    if (metadata.host) details.host = metadata.host;
    if (metadata.port) details.port = metadata.port;
    if (metadata.user) details.user = metadata.user;
    if (metadata.database) details.database = metadata.database;
    if (password) details.password = password;
  }

  // Column casting configuration
  if (metadata.column_casts) {
    details.column_casts = metadata.column_casts;
  }

  return details;
}

