// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { fetchWithErrorHandling, API_BASE_PREFIX } from './apiClient';

export interface DemoDataset {
  id: string;
  label: string;
  description: string;
  database: string;
  table: string;
}

export interface DemoDatasetConnectResponse {
  message: string;
  dataset: {
    id: string;
    database: string;
    table: string;
  };
}

export const demoApi = {
  async listDemoDatasets(signal?: AbortSignal): Promise<{ datasets: DemoDataset[] }> {
    const response = await fetchWithErrorHandling(`${API_BASE_PREFIX}/demo/datasets`, {}, signal);
    return response.json();
  },

  async connectDemoDataset(datasetId: string, signal?: AbortSignal): Promise<DemoDatasetConnectResponse> {
    const response = await fetchWithErrorHandling(
      `${API_BASE_PREFIX}/demo/datasets/${encodeURIComponent(datasetId)}/connect`,
      { method: 'POST' },
      signal,
    );
    return response.json();
  },
};