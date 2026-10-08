// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Connection API Service
 * 
 * Handles database connection lifecycle:
 * - Connect to various data sources (ClickHouse, DuckDB, CSV/Parquet files, Kaggle, etc.)
 * - Disconnect from current connection
 */

import { ConnectionDetails, StagedSelection, StagedUpload } from '../../types';
import { fetchWithErrorHandling, API_BASE_URL, createAbortController } from './apiClient';

export const connectionApi = {
  /**
   * Connect to a data source
   * 
   * For file-based sources, supports uploading multiple files. Each file
   * becomes a separate queryable table (a multi-part file one per selected part).
   * A SQLite upload is a single file whose tables are read from the database schema.
   * 
   * @param details - Connection configuration
   * @param files - Array of files to upload (for 'csv' and 'sqlite' connection types)
   * @param staged - Files already uploaded via stageFiles, with their selected parts
   * @param signal - Optional AbortSignal for request cancellation
   */
  async connect(
    details: ConnectionDetails, 
    files?: File[], 
    staged?: StagedSelection[],
    signal?: AbortSignal
  ): Promise<{ message: string, file_paths?: string[], skipped_parts?: string[] }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    if (details.type === 'csv' || details.type === 'sqlite') {
      const formData = new FormData();
      formData.append('connection_details_json', JSON.stringify(details));
      
      const hasFiles = Boolean(files && files.length > 0);
      const hasStaged = Boolean(staged && staged.length > 0);
      if (!hasFiles && !hasStaged) {
        throw new Error(`At least one file must be provided for connection type ${details.type}.`);
      }
      // Append each file with the same field name - FastAPI handles this as a list
      files?.forEach((file) => {
        formData.append('uploaded_files', file, file.name);
      });
      if (hasStaged) {
        formData.append('staged_uploads_json', JSON.stringify(staged));
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
  /**
   * Upload data files without connecting, listing the parts of multi-part files.
   *
   * Feeds the "Select Parts" step (e.g. workbook sheets): connect/addFiles then reference the
   * returned upload ids, so the files are not uploaded twice. Staging again
   * discards earlier staged uploads that were not used.
   *
   * @param files - Files to stage (zip archives expand to one entry per member)
   * @param signal - Optional AbortSignal for request cancellation
   */
  async stageFiles(
    files: File[],
    signal?: AbortSignal,
  ): Promise<{ uploads: StagedUpload[] }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('uploaded_files', file, file.name);
    });

    const response = await fetchWithErrorHandling(`${API_BASE_URL}/stage-files`, {
      method: 'POST',
      body: formData,
    }, requestSignal);

    return response.json();
  },

  /**
   * Delete staged uploads that will not be used (e.g. the part picker was cancelled).
   */
  async discardStaged(signal?: AbortSignal): Promise<{ message: string }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    const response = await fetchWithErrorHandling(`${API_BASE_URL}/discard-staged`, {
      method: 'POST',
    }, requestSignal);

    return response.json();
  },

  /**
   * Add more data files to an existing file-based connection.
   *
   * Each file becomes a new queryable table in the active session (a
   * multi-part file one per selected part). The connection must already be established.
   *
   * @param files - Files to append to the current connection
   * @param staged - Files already uploaded via stageFiles, with their selected parts
   * @param signal - Optional AbortSignal for request cancellation
   * @returns Object with list of added table names and skipped (empty) parts
   */
  async addFiles(
    files: File[],
    staged?: StagedSelection[],
    signal?: AbortSignal,
  ): Promise<{ message: string; added_tables: string[]; skipped_parts?: string[] }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('uploaded_files', file, file.name);
    });
    if (staged && staged.length > 0) {
      formData.append('staged_uploads_json', JSON.stringify(staged));
    }

    const response = await fetchWithErrorHandling(`${API_BASE_URL}/add-files`, {
      method: 'POST',
      body: formData,
    }, requestSignal);

    return response.json();
  },

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
