// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useSheetCacheCoordinator Hook
 *
 * Coordinates sheet render cache at the VisualizationPage level.
 * Handles saving cache before sheet switch and restoring on mount.
 *
 * This hook should be used in VisualizationPageContent to capture
 * the current queryResult and chartGrid before unmount.
 */

import { useEffect, useRef } from 'react';
import { sheetRenderCacheStore } from '../stores';
import { computeFullConfigHash } from '../utils/sheetConfigHash';
import { QueryResult } from '../types';
import { GridResultModel } from '../observable-plot-generator/gridModel';
import { ChartAffectingConfig } from '../utils/queryAffectingConfig';

type SheetCacheConfig = ChartAffectingConfig;

interface CurrentState {
  queryResult: QueryResult | null;
  chartGrid: GridResultModel | null;
  config: SheetCacheConfig;
}

/**
 * Hook to save current state to cache on unmount.
 * Call this in VisualizationPageContent to ensure cache is saved before sheet switch.
 */
export function useSheetCacheSave(
  sheetId: string | undefined,
  getCurrentState: () => CurrentState
) {
  const sheetIdRef = useRef(sheetId);
  const getStateRef = useRef(getCurrentState);
  
  // Keep refs up to date
  useEffect(() => {
    sheetIdRef.current = sheetId;
    getStateRef.current = getCurrentState;
  });

  // Save to cache on unmount
  useEffect(() => {
    return () => {
      const currentSheetId = sheetIdRef.current;
      if (!currentSheetId) return;
      
      const state = getStateRef.current();
      if (!state.queryResult) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[useSheetCacheSave] Skip save on unmount - no queryResult');
        }
        return;
      }
      
      const configHash = computeFullConfigHash(state.config);

      if (process.env.NODE_ENV === 'development') {
        console.log('[useSheetCacheSave] Saving cache on unmount for sheet:', currentSheetId, {
          configHash,
          hasChartGrid: !!state.chartGrid,
          rowCount: state.queryResult.rows?.length ?? 0,
        });
      }

      sheetRenderCacheStore.saveCache(
        currentSheetId,
        state.queryResult,
        state.chartGrid,
        configHash
      );
    };
  }, []); // Empty deps - only run on mount/unmount
}

/**
 * Hook to restore from cache on mount.
 * Returns cached data if valid, null otherwise.
 */
export function useSheetCacheRestore(
  sheetId: string | undefined,
  config: SheetCacheConfig
): { queryResult: QueryResult; chartGrid: GridResultModel | null } | null {
  const configHash = computeFullConfigHash(config);

  // Only compute once on mount
  const cached = useRef<{ queryResult: QueryResult; chartGrid: GridResultModel | null } | null>(null);
  const hasChecked = useRef(false);

  if (!hasChecked.current && sheetId) {
    hasChecked.current = true;
    const entry = sheetRenderCacheStore.getCache(sheetId, configHash);
    if (entry) {
      cached.current = {
        queryResult: entry.queryResult,
        chartGrid: entry.chartGrid,
      };
      if (process.env.NODE_ENV === 'development') {
        console.log('[useSheetCacheRestore] Cache hit on mount for sheet:', sheetId, {
          configHash,
          rowCount: entry.queryResult.rows?.length ?? 0,
          hasChartGrid: !!entry.chartGrid,
        });
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useSheetCacheRestore] Cache miss on mount for sheet:', sheetId);
      }
    }
  }

  return cached.current;
}

/**
 * Hook to update the cached chart grid when it changes.
 */
export function useSheetCacheGridUpdate(
  sheetId: string | undefined,
  queryResult: QueryResult | null,
  chartGrid: GridResultModel | null,
  config: SheetCacheConfig
) {
  const configHash = computeFullConfigHash(config);
  const prevGridRef = useRef<GridResultModel | null>(null);

  useEffect(() => {
    // Only update if grid actually changed and we have a queryResult
    if (sheetId && queryResult && chartGrid && chartGrid !== prevGridRef.current) {
      prevGridRef.current = chartGrid;

      // Check if cache exists for this config
      const existing = sheetRenderCacheStore.getCache(sheetId, configHash);
      if (existing) {
        // Update grid in existing cache
        sheetRenderCacheStore.saveCache(
          sheetId,
          existing.queryResult,
          chartGrid,
          configHash
        );
        if (process.env.NODE_ENV === 'development') {
          console.log('[useSheetCacheGridUpdate] Updated cached chart grid for sheet:', sheetId);
        }
      }
    }
  }, [sheetId, queryResult, chartGrid, configHash]);
}

/**
 * Combined hook for full cache coordination in ChartArea.
 */
export function useChartAreaCache(
  sheetId: string | undefined,
  queryResult: QueryResult | null,
  chartGrid: GridResultModel | null,
  config: SheetCacheConfig,
  dispatch: (action: any) => void
): {
  /** True if cache was restored on mount */
  wasRestoredFromCache: boolean;
  /** The restored chart grid, if any */
  restoredChartGrid: GridResultModel | null;
} {
  // Try to restore from cache on mount
  const cached = useSheetCacheRestore(sheetId, config);
  const restoredRef = useRef(false);
  const dispatchedRef = useRef(false);

  // Dispatch restored queryResult once
  useEffect(() => {
    if (cached && !dispatchedRef.current) {
      dispatchedRef.current = true;
      restoredRef.current = true;

      if (process.env.NODE_ENV === 'development') {
        console.log('[useChartAreaCache] Restoring queryResult from cache');
      }

      // Dispatch the cached queryResult
      dispatch({ type: 'RESTORE_CACHED_QUERY_RESULT', payload: cached.queryResult });
    }
  }, [cached, dispatch]);

  // Update cached grid when it changes
  useSheetCacheGridUpdate(sheetId, queryResult, chartGrid, config);

  return {
    wasRestoredFromCache: restoredRef.current,
    restoredChartGrid: cached?.chartGrid ?? null,
  };
}
