/**
 * Connection API Service
 * 
 * Handles database connection lifecycle:
 * - Connect to various data sources (ClickHouse, DuckDB, CSV/Parquet files, Kaggle, etc.)
 * - Disconnect from current connection
 */

import { ConnectionDetails } from '../../types';
import { fetchWithErrorHandling, API_BASE_URL, createAbortController } from './apiClient';

export const connectionApi = {
  /**
   * Connect to a data source
   * 
   * For file-based sources (CSV/Parquet), supports uploading multiple files.
   * Each file becomes a separate queryable table.
   * 
   * @param details - Connection configuration
   * @param files - Array of files to upload (for 'csv' connection type)
   * @param signal - Optional AbortSignal for request cancellation
   */
  async connect(
    details: ConnectionDetails, 
    files?: File[], 
    signal?: AbortSignal
  ): Promise<{ message: string, file_paths?: string[] }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    if (details.type === 'csv') {
      const formData = new FormData();
      formData.append('connection_details_json', JSON.stringify(details));
      
      if (files && files.length > 0) {
        // Append each file with the same field name - FastAPI handles this as a list
        files.forEach((file) => {
          formData.append('uploaded_files', file, file.name);
        });
      } else {
        throw new Error('At least one file must be provided for connection type csv.');
      }
      
      const response = await fetchWithErrorHandling(`${API_BASE_URL}/connect`, {
        method: 'POST',
        body: formData,
      }, requestSignal);
      return response.json();
    } else {
      const response = await fetchWithErrorHandling(`${API_BASE_URL}/connect/json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      }, requestSignal);
      return response.json();
    }
  },

  /**
   * Disconnect from current data source
   */
  async disconnect(signal?: AbortSignal): Promise<{ message: string }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    const response = await fetchWithErrorHandling(`${API_BASE_URL}/disconnect`, {
      method: 'POST',
    }, requestSignal);

    return response.json();
  },

  /**
   * Connect to a Hive-partitioned Parquet dataset (Phase 1)
   * 
   * Sends only the file structure (paths) to the backend.
   * Backend parses the partition structure and returns available partitions.
   * 
   * @param fileStructure - Array of relative file paths from folder picker
   * @param signal - Optional AbortSignal for request cancellation
   * @returns Object with partition_column and list of tables (partitions)
   */
  async connectHive(
    fileStructure: string[],
    signal?: AbortSignal
  ): Promise<{ 
    message: string; 
    partition_column: string; 
    tables: string[];
  }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    const response = await fetchWithErrorHandling(`${API_BASE_URL}/connect-hive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'hive_parquet',
        hive_file_structure: fileStructure,
      }),
    }, requestSignal);

    return response.json();
  },

  /**
   * Load files for a specific Hive partition (Phase 2)
   * 
   * Called when user selects a partition (table) in the UI.
   * Uploads the parquet files for that partition and returns the schema.
   * 
   * @param partitionName - The partition value (e.g., "us", "eu")
   * @param files - Parquet files belonging to this partition
   * @param signal - Optional AbortSignal for request cancellation
   * @returns Object with columns list for the partition
   */
  async loadPartition(
    partitionName: string,
    files: File[],
    signal?: AbortSignal
  ): Promise<{
    message: string;
    partition_name: string;
    columns: Array<{ name: string; data_type: string; is_datetime: boolean }>;
  }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    const formData = new FormData();
    formData.append('partition_name', partitionName);
    
    files.forEach((file) => {
      formData.append('uploaded_files', file, file.name);
    });

    const response = await fetchWithErrorHandling(`${API_BASE_URL}/load-partition`, {
      method: 'POST',
      body: formData,
    }, requestSignal);

    return response.json();
  },
};
