/**
 * Sheet Render Cache Store
 *
 * Caches queryResult and chartGrid per sheet to avoid re-querying and re-generating
 * charts when switching between sheets. This provides near-instant sheet switching
 * when the cache is valid.
 *
 * Cache Invalidation:
 * - All caches invalidated when dataSourceVersion changes (table, virtualColumns, etc.)
 * - Individual cache invalidated when sheet config changes (axes, filters, encodings)
 *
 * The cache stores:
 * - queryResult: The data fetched from backend (typically aggregated, small)
 * - chartGrid: The GridResultModel from chart generation
 * - configHash: Hash of sheet-specific config to validate freshness
 * - dataSourceVersion: Version at capture time to detect shared state changes
 */

import { create } from 'zustand';
import { QueryResult } from '../types';
import { GridResultModel } from '../observable-plot-generator/gridModel';

export interface SheetCacheEntry {
  /** The query result data */
  queryResult: QueryResult;
  /** The generated chart grid */
  chartGrid: GridResultModel | null;
  /** Hash of sheet-specific configuration (axes, filters, encodings) */
  configHash: string;
  /** Data source version at capture time */
  dataSourceVersion: number;
  /** Timestamp when cache was created */
  timestamp: number;
}

interface SheetRenderCacheState {
  /** Cache entries keyed by sheetId */
  entries: Map<string, SheetCacheEntry>;
  /** Current data source version - increments on shared state changes */
  dataSourceVersion: number;
}

interface SheetRenderCacheActions {
  /**
   * Save cache entry for a sheet.
   * Call this when switching away from a sheet.
   */
  saveCache: (
    sheetId: string,
    queryResult: QueryResult,
    chartGrid: GridResultModel | null,
    configHash: string
  ) => void;

  /**
   * Get cached entry for a sheet if valid.
   * Returns null if no cache or if dataSourceVersion changed.
   */
  getCache: (sheetId: string, expectedConfigHash: string) => SheetCacheEntry | null;

  /**
   * Check if a valid cache exists for a sheet.
   */
  hasValidCache: (sheetId: string, expectedConfigHash: string) => boolean;

  /**
   * Invalidate cache for a specific sheet.
   */
  invalidateSheet: (sheetId: string) => void;

  /**
   * Invalidate all caches (e.g., on disconnect).
   */
  invalidateAll: () => void;

  /**
   * Increment data source version. Call when shared state changes:
   * - selectedDatabase/selectedTable changes
   * - virtualColumns added/updated/removed
   * - joinedTables/unionTables changes
   * - Connection changes
   * 
   * Note: measureGroupFields is now per-sheet, so it doesn't trigger global invalidation.
   */
  incrementDataSourceVersion: () => void;

  /**
   * Get current data source version.
   */
  getDataSourceVersion: () => number;
}

export type SheetRenderCacheStore = SheetRenderCacheState & SheetRenderCacheActions;

export const useSheetRenderCacheStore = create<SheetRenderCacheStore>((set, get) => ({
  // State
  entries: new Map(),
  dataSourceVersion: 0,

  // Actions
  saveCache: (sheetId, queryResult, chartGrid, configHash) => {
    const currentVersion = get().dataSourceVersion;

    if (process.env.NODE_ENV === 'development') {
      console.log('[SheetRenderCache] Saving cache for sheet:', sheetId, {
        configHash,
        dataSourceVersion: currentVersion,
        hasQueryResult: !!queryResult,
        hasChartGrid: !!chartGrid,
        cellCount: chartGrid?.cells?.length ?? 0,
      });
    }

    set(state => {
      const newEntries = new Map(state.entries);
      newEntries.set(sheetId, {
        queryResult,
        chartGrid,
        configHash,
        dataSourceVersion: currentVersion,
        timestamp: Date.now(),
      });
      return { entries: newEntries };
    });
  },

  getCache: (sheetId, expectedConfigHash) => {
    const state = get();
    const entry = state.entries.get(sheetId);
    
    if (!entry) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[SheetRenderCache] Cache miss - no entry for sheet:', sheetId);
      }
      return null;
    }

    // Check if data source version matches
    if (entry.dataSourceVersion !== state.dataSourceVersion) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[SheetRenderCache] Cache miss - dataSourceVersion mismatch:', {
          sheetId,
          cached: entry.dataSourceVersion,
          current: state.dataSourceVersion,
        });
      }
      return null;
    }

    // Check if config hash matches
    if (entry.configHash !== expectedConfigHash) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[SheetRenderCache] Cache miss - configHash mismatch:', {
          sheetId,
          cached: entry.configHash,
          expected: expectedConfigHash,
        });
      }
      return null;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[SheetRenderCache] Cache hit for sheet:', sheetId, {
        age: Date.now() - entry.timestamp,
        cellCount: entry.chartGrid?.cells?.length ?? 0,
      });
    }

    return entry;
  },

  hasValidCache: (sheetId, expectedConfigHash) => {
    return get().getCache(sheetId, expectedConfigHash) !== null;
  },

  invalidateSheet: (sheetId) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[SheetRenderCache] Invalidating cache for sheet:', sheetId);
    }

    set(state => {
      const newEntries = new Map(state.entries);
      newEntries.delete(sheetId);
      return { entries: newEntries };
    });
  },

  invalidateAll: () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[SheetRenderCache] Invalidating all caches');
    }

    set({ entries: new Map() });
  },

  incrementDataSourceVersion: () => {
    set(state => {
      const newVersion = state.dataSourceVersion + 1;
      if (process.env.NODE_ENV === 'development') {
        console.log('[SheetRenderCache] Incrementing dataSourceVersion:', state.dataSourceVersion, '→', newVersion);
      }
      return { dataSourceVersion: newVersion };
    });
  },

  getDataSourceVersion: () => get().dataSourceVersion,
}));

/**
 * Helper to get the store instance for use outside React components.
 */
export const sheetRenderCacheStore = {
  saveCache: (sheetId: string, queryResult: QueryResult, chartGrid: GridResultModel | null, configHash: string) =>
    useSheetRenderCacheStore.getState().saveCache(sheetId, queryResult, chartGrid, configHash),
  
  getCache: (sheetId: string, expectedConfigHash: string) =>
    useSheetRenderCacheStore.getState().getCache(sheetId, expectedConfigHash),
  
  hasValidCache: (sheetId: string, expectedConfigHash: string) =>
    useSheetRenderCacheStore.getState().hasValidCache(sheetId, expectedConfigHash),
  
  invalidateSheet: (sheetId: string) =>
    useSheetRenderCacheStore.getState().invalidateSheet(sheetId),
  
  invalidateAll: () =>
    useSheetRenderCacheStore.getState().invalidateAll(),
  
  incrementDataSourceVersion: () =>
    useSheetRenderCacheStore.getState().incrementDataSourceVersion(),
  
  getDataSourceVersion: () =>
    useSheetRenderCacheStore.getState().getDataSourceVersion(),
};
