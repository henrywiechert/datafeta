// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { apiService } from '../apiService';
import { AppConfig, defaultAppConfig } from '../services/api/appConfigApi';

interface AppConfigContextValue {
  appConfig: AppConfig;
  isLoading: boolean;
  error: string | null;
  isConnectorAllowed: (connectorId: string) => boolean;
}

const AppConfigContext = createContext<AppConfigContextValue | undefined>(undefined);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [appConfig, setAppConfig] = useState<AppConfig>(defaultAppConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const config = await apiService.getAppConfig(controller.signal);
        setAppConfig(config);
      } catch (err) {
        if (err instanceof Error && err.message === 'Request was cancelled') return;
        setError(err instanceof Error ? err.message : 'Failed to load app configuration');
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const value = useMemo<AppConfigContextValue>(() => ({
    appConfig,
    isLoading,
    error,
    isConnectorAllowed: (connectorId: string) => (
      !appConfig.connectors.restricted || appConfig.connectors.allowed.includes(connectorId)
    ),
  }), [appConfig, error, isLoading]);

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfigContextValue {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error('useAppConfig must be used within an AppConfigProvider');
  }
  return context;
}