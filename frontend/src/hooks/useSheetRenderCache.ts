// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useSheetRenderCache Hook
 *
 * Manages caching and restoring of queryResult and chartGrid for sheet switching.
 *
 * Usage:
 * - Call `saveCurrentToCache()` before switching away from a sheet
 * - Call `restoreFromCache()` on mount to check for cached data
 * - Call `updateCachedChartGrid()` when the chart grid changes
 *
 * The hook automatically:
 * - Computes config hashes for cache validation
 * - Validates cache against dataSourceVersion
 * - Logs cache hits/misses in development
 */

import { useCallback, useRef, useEffect } from 'react';
import { useSheetRenderCacheStore, sheetRenderCacheStore } from '../stores';
import { computeFullConfigHash } from '../utils/sheetConfigHash';
import { QueryResult, Field, FilterConfig, FieldOverrideState, UserChartType } from '../types';
import { GridResultModel } from '../observable-plot-generator/gridModel';

interface SheetConfig {
  xAxisFields: Field[];
  yAxisFields: Field[];
  appliedFilterConfigurations: Record<string, FilterConfig>;
  colorField: Field | null;
  sizeField: Field | null;
  shapeField?: Field | null;
  labelFields?: Field[];
  tooltipFields?: Field[];
  colorScheme?: string;
  colorBias?: number;
  colorReversed?: boolean;
  manualColor?: string;
  manualShape?: string;
  sizeRange?: [number, number];
  manualSize?: number;
  bandThicknessScale?: number;
  fieldOverrides?: Record<string, FieldOverrideState>;
  globalChartType?: UserChartType | null;
  independentDomains?: { x?: boolean; y?: boolean };
  labelsEnabled?: boolean;
  labelSamplingStrategy?: string;
  labelSamplingThreshold?: number;
  labelSampleEvery?: number;
}

interface UseSheetRenderCacheProps {
  sheetId: string | undefined;
  config: SheetConfig;
}

interface UseSheetRenderCacheReturn {
  /**
   * Save current queryResult and chartGrid to cache.
   * Call this before switching away from a sheet.
   */
  saveCurrentToCache: (queryResult: QueryResult | null, chartGrid: GridResultModel | null) => void;

  /**
   * Try to restore from cache. Returns cached data if valid, null otherwise.
   */
  restoreFromCache: () => { queryResult: QueryResult; chartGrid: GridResultModel | null } | null;

  /**
   * Check if there's a valid cache for the current config.
   */
  hasValidCache: () => boolean;

  /**
   * Get current config hash (useful for debugging).
   */
  getConfigHash: () => string;

  /**
   * Update the cached chart grid (useful when only the grid changed, not the query).
   */
  updateCachedChartGrid: (chartGrid: GridResultModel | null) => void;
}

export function useSheetRenderCache({
  sheetId,
  config,
}: UseSheetRenderCacheProps): UseSheetRenderCacheReturn {
  // Compute config hash
  const configHash = computeFullConfigHash(config);
  
  // Keep refs for latest values to avoid closure issues
  const configHashRef = useRef(configHash);
  const sheetIdRef = useRef(sheetId);
  
  useEffect(() => {
    configHashRef.current = configHash;
    sheetIdRef.current = sheetId;
  }, [configHash, sheetId]);

  const saveCurrentToCache = useCallback((
    queryResult: QueryResult | null,
    chartGrid: GridResultModel | null
  ) => {
    const currentSheetId = sheetIdRef.current;
    const currentConfigHash = configHashRef.current;

    if (!currentSheetId || !queryResult) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useSheetRenderCache] Skip save - no sheetId or queryResult', {
          sheetId: currentSheetId,
          hasQueryResult: !!queryResult,
        });
      }
      return;
    }

    sheetRenderCacheStore.saveCache(
      currentSheetId,
      queryResult,
      chartGrid,
      currentConfigHash
    );
  }, []);

  const restoreFromCache = useCallback(() => {
    const currentSheetId = sheetIdRef.current;
    const currentConfigHash = configHashRef.current;

    if (!currentSheetId) {
      return null;
    }

    const cached = sheetRenderCacheStore.getCache(currentSheetId, currentConfigHash);

    if (cached) {
      return {
        queryResult: cached.queryResult,
        chartGrid: cached.chartGrid,
      };
    }

    return null;
  }, []);

  const hasValidCache = useCallback(() => {
    const currentSheetId = sheetIdRef.current;
    const currentConfigHash = configHashRef.current;
    
    if (!currentSheetId) {
      return false;
    }

    return sheetRenderCacheStore.hasValidCache(currentSheetId, currentConfigHash);
  }, []);

  const getConfigHash = useCallback(() => {
    return configHashRef.current;
  }, []);

  const updateCachedChartGrid = useCallback((chartGrid: GridResultModel | null) => {
    const currentSheetId = sheetIdRef.current;
    const currentConfigHash = configHashRef.current;

    if (!currentSheetId) {
      return;
    }

    // Get existing cache entry
    const cached = sheetRenderCacheStore.getCache(currentSheetId, currentConfigHash);

    if (cached) {
      // Update with new chart grid
      sheetRenderCacheStore.saveCache(
        currentSheetId,
        cached.queryResult,
        chartGrid,
        currentConfigHash
      );
    }
  }, []);

  return {
    saveCurrentToCache,
    restoreFromCache,
    hasValidCache,
    getConfigHash,
    updateCachedChartGrid,
  };
}

/**
 * Hook to listen for data source changes and increment version.
 * Should be used at the app level (e.g., in DataSourceProvider or App).
 * Note: measureGroupFields is now per-sheet, so it doesn't trigger global invalidation.
 */
export function useDataSourceVersionSync(deps: {
  selectedDatabase: string;
  selectedTable: string;
  virtualColumnsLength: number;
  joinedTablesLength: number;
  unionTablesLength: number;
}) {
  const prevDepsRef = useRef(deps);
  const incrementDataSourceVersion = useSheetRenderCacheStore(
    state => state.incrementDataSourceVersion
  );

  useEffect(() => {
    const prev = prevDepsRef.current;
    const changed = 
      prev.selectedDatabase !== deps.selectedDatabase ||
      prev.selectedTable !== deps.selectedTable ||
      prev.virtualColumnsLength !== deps.virtualColumnsLength ||
      prev.joinedTablesLength !== deps.joinedTablesLength ||
      prev.unionTablesLength !== deps.unionTablesLength;

    if (changed) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useDataSourceVersionSync] Data source changed, incrementing version', {
          prev,
          current: deps,
        });
      }
      incrementDataSourceVersion();
      prevDepsRef.current = deps;
    }
  }, [deps, incrementDataSourceVersion]);
}
