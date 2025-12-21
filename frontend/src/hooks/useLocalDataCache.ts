/**
 * useLocalDataCache Hook
 * 
 * React hook for managing local data caching with DuckDB WASM.
 * Integrates with the existing query execution flow to cache
 * query results and enable local per-chart queries.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  duckdbService, 
  cacheManager, 
  generateFilterHash,
  DuckDBInitStatus,
  CachedTableInfo,
} from '../services';
import { apiService } from '../apiService';
import { QueryDescription, QueryResult } from '../types';

export interface LocalCacheState {
  /** DuckDB WASM initialization status */
  initStatus: DuckDBInitStatus;
  /** Current cache key (table name in DuckDB WASM) */
  cacheKey: string | null;
  /** Cached table metadata */
  cacheInfo: CachedTableInfo | null;
  /** Error message if any */
  error: string | null;
  /** Whether data is being loaded */
  isLoading: boolean;
}

export interface UseLocalDataCacheReturn extends LocalCacheState {
  /** Initialize DuckDB WASM (call once on app mount) */
  initialize: () => Promise<void>;
  /** Fetch data from backend and cache it locally */
  fetchAndCache: (
    queryDesc: QueryDescription,
    filterHash?: string
  ) => Promise<string>;
  /** Check if data is cached and available for local queries */
  isCached: (
    sourceTable: string,
    sourceDatabase: string | undefined,
    columns: string[],
    filterHash?: string
  ) => boolean;
  /** Invalidate cache for a specific source table */
  invalidate: (sourceTable: string, sourceDatabase?: string) => Promise<void>;
  /** Invalidate all cached data */
  invalidateAll: () => Promise<void>;
}

/**
 * Hook for managing local data caching with DuckDB WASM.
 * 
 * Usage:
 * ```tsx
 * const { initialize, fetchAndCache, cacheKey, initStatus } = useLocalDataCache();
 * 
 * useEffect(() => {
 *   initialize();
 * }, []);
 * 
 * const handleQuery = async () => {
 *   const key = await fetchAndCache(queryDesc);
 *   // Now use chartQueryService with `key` to query locally
 * };
 * ```
 */
export function useLocalDataCache(): UseLocalDataCacheReturn {
  const [state, setState] = useState<LocalCacheState>({
    initStatus: 'uninitialized',
    cacheKey: null,
    cacheInfo: null,
    error: null,
    isLoading: false,
  });

  // Track initialization to avoid duplicate calls
  const initPromiseRef = useRef<Promise<void> | null>(null);

  /**
   * Initialize DuckDB WASM
   */
  const initialize = useCallback(async () => {
    // Skip if already initialized or initializing
    if (duckdbService.isReady) {
      setState(prev => ({ ...prev, initStatus: 'ready' }));
      return;
    }

    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    setState(prev => ({ ...prev, initStatus: 'initializing', error: null }));

    initPromiseRef.current = (async () => {
      try {
        await duckdbService.initialize();
        setState(prev => ({ ...prev, initStatus: 'ready' }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to initialize DuckDB WASM';
        setState(prev => ({ ...prev, initStatus: 'error', error: message }));
        throw error;
      } finally {
        initPromiseRef.current = null;
      }
    })();

    return initPromiseRef.current;
  }, []);

  /**
   * Fetch data from backend using Arrow transport and cache in DuckDB WASM
   */
  const fetchAndCache = useCallback(async (
    queryDesc: QueryDescription,
    filterHash?: string
  ): Promise<string> => {
    // Ensure DuckDB is ready
    if (!duckdbService.isReady) {
      await initialize();
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Use Arrow transport for efficient data transfer
      const arrowResult = await apiService.executeQueryArrowRaw(queryDesc);
      
      // Cache the Arrow data in DuckDB WASM
      const cacheKey = await cacheManager.cacheArrowBuffer(
        queryDesc.target_table,
        queryDesc.target_database,
        arrowResult.arrowBuffer,
        filterHash
      );

      const cacheInfo = cacheManager.getCacheInfo(cacheKey);

      setState(prev => ({
        ...prev,
        cacheKey,
        cacheInfo: cacheInfo || null,
        isLoading: false,
      }));

      console.log(`✅ Cached ${arrowResult.rowCount} rows as "${cacheKey}"`);
      return cacheKey;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch and cache data';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      throw error;
    }
  }, [initialize]);

  /**
   * Check if data is cached for given parameters
   */
  const isCached = useCallback((
    sourceTable: string,
    sourceDatabase: string | undefined,
    columns: string[],
    filterHash?: string
  ): boolean => {
    const key = cacheManager.getCacheKeyIfAvailable(
      sourceTable,
      sourceDatabase,
      columns,
      filterHash
    );
    return key !== null;
  }, []);

  /**
   * Invalidate cache for a source table
   */
  const invalidate = useCallback(async (
    sourceTable: string,
    sourceDatabase?: string
  ): Promise<void> => {
    await cacheManager.invalidateSourceCaches(sourceTable, sourceDatabase);
    
    // Clear current cache key if it was for this table
    setState(prev => {
      if (prev.cacheInfo?.sourceTable === sourceTable &&
          prev.cacheInfo?.sourceDatabase === sourceDatabase) {
        return { ...prev, cacheKey: null, cacheInfo: null };
      }
      return prev;
    });
  }, []);

  /**
   * Invalidate all cached data
   */
  const invalidateAll = useCallback(async (): Promise<void> => {
    await cacheManager.invalidateAll();
    setState(prev => ({ ...prev, cacheKey: null, cacheInfo: null }));
  }, []);

  // Update status from service when it changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      initStatus: duckdbService.status,
    }));
  }, []);

  return {
    ...state,
    initialize,
    fetchAndCache,
    isCached,
    invalidate,
    invalidateAll,
  };
}

/**
 * Hook for generating filter hash for cache key generation
 */
export function useFilterHash(filters: Record<string, any>): string {
  return generateFilterHash(filters);
}

