/**
 * Query Decision Engine
 * 
 * Determines query strategy based on:
 * - Which columns are already cached in DuckDB WASM
 * - Current filter state (base vs refinement)
 * - Dataset size (via row count probe)
 * 
 * Implements hybrid aggregation approach:
 * - Small datasets (< threshold): Fetch raw columns, aggregate locally
 * - Large datasets (> threshold): Fetch pre-aggregated from backend
 *
 * Note: "raw_columns" currently still executes the normal backend chart query.
 * True "fetch only missing columns and merge into cache" is a follow-up.
 */

import { apiService } from '../apiService';
import { columnCacheManager } from './columnCacheManager';
import { filterTierManager } from './filterTierManager';

// Default threshold: 100,000 rows (local OK up to this; above prefer backend)
const DEFAULT_SIZE_THRESHOLD = 5_000_000;

export type QueryStrategy = 'raw_columns' | 'pre_aggregated' | 'cache_hit';

export interface QueryDecision {
  strategy: QueryStrategy;
  
  // For cache_hit: columns available locally
  cachedColumns?: string[];
  
  // For raw_columns/pre_aggregated: columns to fetch
  columnsToFetch?: string[];
  
  // Estimated row count (from probe or cache)
  estimatedRowCount?: number;
  
  // Whether current filters require backend query
  requiresBackendQuery: boolean;
  
  // Filter information
  baseFilterHash?: string;
  refinementFilters?: Record<string, any>;
  
  // Reason for decision (for debugging)
  reason: string;

  // Optional: budget info for downstream reduction/debugging
  resultBudget?: {
    max_rows: number;
    strategy: 'none' | 'random' | 'stratified';
    stratify_field?: string;
    min_per_stratum?: number;
  };
}

export interface QueryDecisionInput {
  sourceTable: string;
  sourceDatabase?: string;
  requiredColumns: string[];
  filterConfigurations: Record<string, any>;
  // If true, we need aggregated data (has measures with aggregations)
  requiresAggregation: boolean;
  // Optional: dimensions for aggregation (used when deciding pre-aggregation)
  dimensions?: string[];
  // Optional: virtual table/columns context (needed for correct row-count probing)
  virtualTable?: any;
  virtualColumns?: any[];
  // Optional: override the size threshold
  sizeThreshold?: number;
}

class QueryDecisionEngine {
  private sizeThreshold: number = DEFAULT_SIZE_THRESHOLD;
  private rowCountCache: Map<string, { count: number; timestamp: number }> = new Map();
  private readonly ROW_COUNT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Set the size threshold for raw vs aggregated strategy
   */
  setSizeThreshold(threshold: number): void {
    this.sizeThreshold = threshold;
    console.log(`📊 Query size threshold set to ${threshold.toLocaleString()} rows`);
  }
  
  /**
   * Get current size threshold
   */
  getSizeThreshold(): number {
    return this.sizeThreshold;
  }
  
  /**
   * Make a query decision based on current state
   * 
   * Decision flow:
   * 1. If base filter changed → invalidate cache, probe row count, decide strategy
   * 2. If all columns cached → return cache_hit (local query)
   * 3. Otherwise → probe row count, decide strategy based on size
   * 
   * Strategy selection (based on row count):
   * - rowCount ≤ threshold → 'raw_columns' (fetch raw data for local caching)
   * - rowCount > threshold → 'pre_aggregated' (let backend aggregate)
   */
  async decide(input: QueryDecisionInput): Promise<QueryDecision> {
    const {
      sourceTable,
      sourceDatabase,
      requiredColumns,
      filterConfigurations,
      virtualTable,
      virtualColumns,
      sizeThreshold = this.sizeThreshold,
    } = input;
    
    // Step 1: Determine filter tier state
    let baseFilterHash = filterTierManager.getBaseFilterHash(sourceTable, sourceDatabase);
    const refinementFilters = filterTierManager.getRefinementFilters(filterConfigurations);
    const hasBaseFilterChanged = filterTierManager.hasBaseFilterChanged(filterConfigurations, sourceTable, sourceDatabase);
    
    // Step 2: Handle base filter change - invalidate cache and update state
    if (hasBaseFilterChanged) {
      await columnCacheManager.invalidateForTable(sourceTable, sourceDatabase);
      filterTierManager.updateBaseFilters(filterConfigurations, sourceTable, sourceDatabase);
      baseFilterHash = filterTierManager.getBaseFilterHash(sourceTable, sourceDatabase);
    }
    
    // Step 3: Check cache for required columns (only useful if filter didn't change)
    const cachedColumns = hasBaseFilterChanged 
      ? [] 
      : columnCacheManager.getCachedColumns(sourceTable, sourceDatabase, baseFilterHash);
    
    const missingColumns = requiredColumns.filter(col => !cachedColumns.includes(col));
    
    // If all columns are cached, we can query locally
    if (missingColumns.length === 0) {
      return {
        strategy: 'cache_hit',
        cachedColumns: requiredColumns,
        requiresBackendQuery: false,
        baseFilterHash,
        refinementFilters,
        reason: `All ${requiredColumns.length} columns available in cache`,
      };
    }
    
    // Step 4: Need to fetch from backend - probe row count to decide strategy
    const rowCount = await this.probeRowCount(sourceTable, sourceDatabase, filterConfigurations, virtualTable, virtualColumns);
    
    // Step 5: Decide strategy based on dataset size
    return this.buildStrategyDecision({
      rowCount,
      sizeThreshold,
      columnsToFetch: hasBaseFilterChanged ? requiredColumns : missingColumns,
      cachedColumns: hasBaseFilterChanged ? undefined : cachedColumns,
      baseFilterHash,
      refinementFilters,
      baseFilterChanged: hasBaseFilterChanged,
    });
  }
  
  /**
   * Build the strategy decision based on row count vs threshold
   */
  private buildStrategyDecision(params: {
    rowCount: number;
    sizeThreshold: number;
    columnsToFetch: string[];
    cachedColumns?: string[];
    baseFilterHash: string;
    refinementFilters: Record<string, any>;
    baseFilterChanged: boolean;
  }): QueryDecision {
    const { rowCount, sizeThreshold, columnsToFetch, cachedColumns, baseFilterHash, refinementFilters, baseFilterChanged } = params;
    const prefix = baseFilterChanged ? 'Base filter changed - ' : '';
    
    if (rowCount <= sizeThreshold) {
      return {
        strategy: 'raw_columns',
        columnsToFetch,
        cachedColumns,
        estimatedRowCount: rowCount,
        requiresBackendQuery: true,
        baseFilterHash,
        refinementFilters,
        reason: `${prefix}Row count (${rowCount.toLocaleString()}) below threshold (${sizeThreshold.toLocaleString()}) - fetching raw columns`,
      };
    } else {
      return {
        strategy: 'pre_aggregated',
        columnsToFetch,
        cachedColumns,
        estimatedRowCount: rowCount,
        requiresBackendQuery: true,
        baseFilterHash,
        refinementFilters,
        reason: `${prefix}Row count (${rowCount.toLocaleString()}) exceeds threshold (${sizeThreshold.toLocaleString()}) - fetching pre-aggregated`,
      };
    }
  }
  
  /**
   * Probe the backend for row count
   */
  private async probeRowCount(
    sourceTable: string,
    sourceDatabase?: string,
    filterConfigurations?: Record<string, any>,
    virtualTable?: any,
    virtualColumns?: any[]
  ): Promise<number> {
    // Create cache key
    const baseFiltersOnly = filterTierManager.getBaseFiltersOnly(filterConfigurations || {});
    const filterHash = filterTierManager.hashFilters(baseFiltersOnly);
    const cacheKey = `${sourceDatabase || ''}_${sourceTable}_${filterHash}`;
    
    // Check cache
    const cached = this.rowCountCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.ROW_COUNT_CACHE_TTL) {
      console.log(`📊 Using cached row count for ${sourceTable}: ${cached.count.toLocaleString()}`);
      return cached.count;
    }
    
    try {
      // Call backend count endpoint
      const count = await apiService.getRowCount(
        sourceTable,
        sourceDatabase,
        baseFiltersOnly,
        virtualColumns,
        virtualTable
      );
      
      // Cache the result
      this.rowCountCache.set(cacheKey, { count, timestamp: Date.now() });
      console.log(`📊 Probed row count for ${sourceTable}: ${count.toLocaleString()}`);
      
      return count;
    } catch (error) {
      console.warn('⚠️ Failed to probe row count, using default threshold assumption:', error);
      // Return a value below threshold to default to raw columns
      return this.sizeThreshold - 1;
    }
  }
  
  /**
   * Clear the row count cache
   */
  clearRowCountCache(): void {
    this.rowCountCache.clear();
  }
  
  /**
   * Get decision statistics for debugging
   */
  getStats(): {
    sizeThreshold: number;
    rowCountCacheSize: number;
  } {
    return {
      sizeThreshold: this.sizeThreshold,
      rowCountCacheSize: this.rowCountCache.size,
    };
  }
}

// Export singleton instance
export const queryDecisionEngine = new QueryDecisionEngine();

// Also export the class for testing
export { QueryDecisionEngine };

