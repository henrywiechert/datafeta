/**
 * Kaggle API Service
 * 
 * Handles Kaggle-specific operations:
 * - Search Kaggle datasets
 * - List files in a Kaggle dataset
 */

import { KaggleSearchResponse, KaggleFilesResponse } from '../../types';
import { fetchWithErrorHandling, API_BASE_URL } from './apiClient';

export const kaggleApi = {
  /**
   * Search Kaggle datasets
   */
  async searchKaggleDatasets(
    username: string, 
    apiKey: string, 
    searchQuery: string
  ): Promise<KaggleSearchResponse> {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/kaggle/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        api_key: apiKey,
        search_query: searchQuery
      })
    });
    return response.json();
  },

  /**
   * List files in a Kaggle dataset
   */
  async listKaggleFiles(
    username: string, 
    apiKey: string, 
    dataset: string
  ): Promise<KaggleFilesResponse> {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/kaggle/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        api_key: apiKey,
        dataset
      })
    });
    return response.json();
  },
};
