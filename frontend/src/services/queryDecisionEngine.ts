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
 */

import { apiService } from '../apiService';
import { columnCacheManager } from './columnCacheManager';
import { filterTierManager, FilterTier } from './filterTierManager';

// Default threshold: 500,000 rows
const DEFAULT_SIZE_THRESHOLD = 500_000;

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
   */
  async decide(input: QueryDecisionInput): Promise<QueryDecision> {
    const {
      sourceTable,
      sourceDatabase,
      requiredColumns,
      filterConfigurations,
      requiresAggregation,
      dimensions = [],
      sizeThreshold = this.sizeThreshold,
    } = input;
    
    // Step 1: Determine filter tier state
    const baseFilterHash = filterTierManager.getBaseFilterHash();
    const refinementFilters = filterTierManager.getRefinementFilters(filterConfigurations);
    const hasBaseFilterChanged = filterTierManager.hasBaseFilterChanged(filterConfigurations);
    
    // Step 2: Check if base filters changed - forces backend query
    if (hasBaseFilterChanged) {
      // Clear column cache for this table (base filter changed)
      await columnCacheManager.invalidateForTable(sourceTable, sourceDatabase);
      filterTierManager.updateBaseFilters(filterConfigurations);
      
      return {
        strategy: 'raw_columns',
        columnsToFetch: requiredColumns,
        requiresBackendQuery: true,
        baseFilterHash: filterTierManager.getBaseFilterHash(),
        refinementFilters,
        reason: 'Base filter changed - cache invalidated',
      };
    }
    
    // Step 3: Check cache for required columns
    const cachedColumns = columnCacheManager.getCachedColumns(
      sourceTable,
      sourceDatabase,
      baseFilterHash
    );
    
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
    
    // Step 4: Need to fetch missing columns - determine strategy
    // Probe row count to decide raw vs aggregated
    const rowCount = await this.probeRowCount(sourceTable, sourceDatabase, filterConfigurations);
    
    // Step 5: Decide strategy based on size
    if (rowCount <= sizeThreshold) {
      // Small dataset - fetch raw columns
      return {
        strategy: 'raw_columns',
        columnsToFetch: missingColumns,
        cachedColumns,
        estimatedRowCount: rowCount,
        requiresBackendQuery: true,
        baseFilterHash,
        refinementFilters,
        reason: `Row count (${rowCount.toLocaleString()}) below threshold (${sizeThreshold.toLocaleString()}) - fetching raw columns`,
      };
    } else {
      // Large dataset - need pre-aggregation
      if (requiresAggregation && dimensions.length > 0) {
        return {
          strategy: 'pre_aggregated',
          columnsToFetch: requiredColumns, // For pre-agg, fetch all (including measures)
          estimatedRowCount: rowCount,
          requiresBackendQuery: true,
          baseFilterHash,
          refinementFilters,
          reason: `Row count (${rowCount.toLocaleString()}) exceeds threshold (${sizeThreshold.toLocaleString()}) - fetching pre-aggregated`,
        };
      } else {
        // No aggregation needed but large dataset - still fetch raw but warn
        return {
          strategy: 'raw_columns',
          columnsToFetch: missingColumns,
          cachedColumns,
          estimatedRowCount: rowCount,
          requiresBackendQuery: true,
          baseFilterHash,
          refinementFilters,
          reason: `Large dataset (${rowCount.toLocaleString()} rows) without aggregation - fetching raw columns (may be slow)`,
        };
      }
    }
  }
  
  /**
   * Probe the backend for row count
   */
  private async probeRowCount(
    sourceTable: string,
    sourceDatabase?: string,
    filterConfigurations?: Record<string, any>
  ): Promise<number> {
    // Create cache key
    const filterHash = filterTierManager.hashFilters(
      filterTierManager.getBaseFiltersOnly(filterConfigurations || {})
    );
    const cacheKey = `${sourceDatabase || ''}_${sourceTable}_${filterHash}`;
    
    // Check cache
    const cached = this.rowCountCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.ROW_COUNT_CACHE_TTL) {
      console.log(`📊 Using cached row count for ${sourceTable}: ${cached.count.toLocaleString()}`);
      return cached.count;
    }
    
    try {
      // Call backend count endpoint
      const count = await apiService.getRowCount(sourceTable, sourceDatabase, filterConfigurations);
      
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

