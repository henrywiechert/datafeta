/**
 * Connection API Service
 * 
 * Handles database connection lifecycle:
 * - Connect to various data sources (ClickHouse, DuckDB, CSV, Kaggle, etc.)
 * - Disconnect from current connection
 */

import { ConnectionDetails } from '../../types';
import { fetchWithErrorHandling, API_BASE_URL, createAbortController } from './apiClient';

export const connectionApi = {
  /**
   * Connect to a data source
   */
  async connect(
    details: ConnectionDetails, 
    file?: File, 
    signal?: AbortSignal
  ): Promise<{ message: string, file_path?: string }> {
    const abortController = signal ? null : createAbortController();
    const requestSignal = signal || abortController?.signal;

    if (details.type === 'csv') {
      const formData = new FormData();
      formData.append('connection_details_json', JSON.stringify(details));
      if (file) {
        formData.append('uploaded_file', file, file.name);
      } else {
        throw new Error('CSV file must be provided for connection type csv.');
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
};
