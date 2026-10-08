// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { fetchWithErrorHandling, API_BASE_PREFIX } from './apiClient';

/** Parsing option groups a file format honours (see backend file_handlers/base.py). */
export type FileFormatOption = 'csv' | 'date_formats';

/** An uploadable file format as registered in the backend's handler registry. */
export interface FileFormatInfo {
  key: string;
  label: string;
  extensions: string[];
  options: FileFormatOption[];
  /** Singular noun for selectable parts (e.g. "sheet"); null = one table per file. */
  partLabel: string | null;
}

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
  /** Supported upload formats; empty until the config has loaded. */
  fileFormats: FileFormatInfo[];
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
  fileFormats: [],
};

export const appConfigApi = {
  async getAppConfig(signal?: AbortSignal): Promise<AppConfig> {
    const response = await fetchWithErrorHandling(`${API_BASE_PREFIX}/app-config`, {}, signal);
    return response.json();
  },
};