/**
 * useSheetCacheCoordinator Hook
 * 
 * Coordinates sheet render cache at the VisualizationPage level.
 * Handles saving cache before sheet switch and restoring on mount.
 * 
 * This hook should be used in VisualizationPageContent to capture
 * the current queryResult and chartSpec before unmount.
 */

import { useEffect, useRef } from 'react';
import { sheetRenderCacheStore } from '../stores';
import { computeFullConfigHash } from '../utils/sheetConfigHash';
import { QueryResult, Field, FilterConfig, FieldOverrideState, UserChartType } from '../types';
import { PlotResult } from '../observable-plot-generator/types';

interface SheetCacheConfig {
  xAxisFields: Field[];
  yAxisFields: Field[];
  appliedFilterConfigurations: Record<string, FilterConfig>;
  colorField: Field | null;
  sizeField: Field | null;
  labelFields?: Field[];
  tooltipFields?: Field[];
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;
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

interface CurrentState {
  queryResult: QueryResult | null;
  chartSpec: PlotResult | null;
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
          hasChartSpec: !!state.chartSpec,
          rowCount: state.queryResult.rows?.length ?? 0,
        });
      }
      
      sheetRenderCacheStore.saveCache(
        currentSheetId,
        state.queryResult,
        state.chartSpec,
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
): { queryResult: QueryResult; chartSpec: PlotResult | null } | null {
  const configHash = computeFullConfigHash(config);
  
  // Only compute once on mount
  const cached = useRef<{ queryResult: QueryResult; chartSpec: PlotResult | null } | null>(null);
  const hasChecked = useRef(false);
  
  if (!hasChecked.current && sheetId) {
    hasChecked.current = true;
    const entry = sheetRenderCacheStore.getCache(sheetId, configHash);
    if (entry) {
      cached.current = {
        queryResult: entry.queryResult,
        chartSpec: entry.chartSpec,
      };
      if (process.env.NODE_ENV === 'development') {
        console.log('[useSheetCacheRestore] Cache hit on mount for sheet:', sheetId, {
          configHash,
          rowCount: entry.queryResult.rows?.length ?? 0,
          hasChartSpec: !!entry.chartSpec,
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
 * Hook to update the cached chart spec when it changes.
 */
export function useSheetCacheSpecUpdate(
  sheetId: string | undefined,
  queryResult: QueryResult | null,
  chartSpec: PlotResult | null,
  config: SheetCacheConfig
) {
  const configHash = computeFullConfigHash(config);
  const prevSpecRef = useRef<PlotResult | null>(null);
  
  useEffect(() => {
    // Only update if spec actually changed and we have a queryResult
    if (sheetId && queryResult && chartSpec && chartSpec !== prevSpecRef.current) {
      prevSpecRef.current = chartSpec;
      
      // Check if cache exists for this config
      const existing = sheetRenderCacheStore.getCache(sheetId, configHash);
      if (existing) {
        // Update spec in existing cache
        sheetRenderCacheStore.saveCache(
          sheetId,
          existing.queryResult,
          chartSpec,
          configHash
        );
        if (process.env.NODE_ENV === 'development') {
          console.log('[useSheetCacheSpecUpdate] Updated cached chart spec for sheet:', sheetId);
        }
      }
    }
  }, [sheetId, queryResult, chartSpec, configHash]);
}

/**
 * Combined hook for full cache coordination in ChartArea.
 */
export function useChartAreaCache(
  sheetId: string | undefined,
  queryResult: QueryResult | null,
  chartSpec: PlotResult | null,
  config: SheetCacheConfig,
  dispatch: (action: any) => void
): {
  /** True if cache was restored on mount */
  wasRestoredFromCache: boolean;
  /** The restored chart spec, if any */
  restoredChartSpec: PlotResult | null;
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
  
  // Update cached spec when it changes
  useSheetCacheSpecUpdate(sheetId, queryResult, chartSpec, config);
  
  return {
    wasRestoredFromCache: restoredRef.current,
    restoredChartSpec: cached?.chartSpec ?? null,
  };
}
