// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { fetchWithErrorHandling, API_BASE_PREFIX } from './apiClient';

export interface AppConfig {
  appMode: string;
  isDemoMode: boolean;
  snapshots: {
    enabled: boolean;
    writable: boolean;
    mode: 'writable' | 'readonly' | 'disabled' | string;
  };
  debugUiEnabled: boolean;
  connectors: {
    restricted: boolean;
    allowed: string[];
  };
  demoDatasets: {
    enabled: boolean;
    available: boolean;
  };
}

export const defaultAppConfig: AppConfig = {
  appMode: 'standard',
  isDemoMode: false,
  snapshots: {
    enabled: true,
    writable: true,
    mode: 'writable',
  },
  debugUiEnabled: true,
  connectors: {
    restricted: false,
    allowed: [],
  },
  demoDatasets: {
    enabled: false,
    available: false,
  },
};

export const appConfigApi = {
  async getAppConfig(signal?: AbortSignal): Promise<AppConfig> {
    const response = await fetchWithErrorHandling(`${API_BASE_PREFIX}/app-config`, {}, signal);
    return response.json();
  },
};