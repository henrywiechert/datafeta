// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * HuggingFace API Service
 *
 * Handles HuggingFace-specific operations:
 * - Search HuggingFace datasets
 * - List Parquet-backed dataset splits
 */

import { HuggingFaceSearchResponse, HuggingFaceSplitsResponse } from '../../types';
import { fetchWithErrorHandling, API_BASE_URL } from './apiClient';

export const huggingFaceApi = {
  /**
   * Search HuggingFace datasets.
   */
  async searchHuggingFaceDatasets(
    token: string,
    searchQuery: string
  ): Promise<HuggingFaceSearchResponse> {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/huggingface/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token || undefined,
        search_query: searchQuery,
      }),
    });
    return response.json();
  },

  /**
   * List Parquet-backed splits in a HuggingFace dataset.
   */
  async listHuggingFaceSplits(
    token: string,
    dataset: string
  ): Promise<HuggingFaceSplitsResponse> {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/huggingface/splits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token || undefined,
        dataset,
      }),
    });
    return response.json();
  },
};
